/********************************************************/
/* WA-SERVER                                            */
/* Para executar use: node wa-server.js &               */
/********************************************************/
process.title = 'wa-server';
const Version = 'v1.0.0';

async function GetDate() {
	let offset = new Date(new Date().getTime()).getTimezoneOffset();
	return new Date(new Date().getTime() - (offset*60*1000)).toISOString().replace(/T/,' ').replace(/\..+/, '');
}

const greetingMessages = () => {
	let greetings = ['Posso ajudar?', 'Precisa de ajuda?', 'Pode perguntar estou aqui pra ajudar.'];
	let h = new Date().getHours();
	return (h <= 5) ? 'Boa madrugada' :
		   (h < 12) ? 'Bom dia' :
		   (h < 18) ? 'Boa tarde' :
		   'Boa noite';
}

// Publica o estatus no SAN
async function PublishUpdate() {
	GetDate().then(dte => {
		let uptime = Date.parse(dte) - starttime;
		hub.publish('san:server_update','{"name":"'+process.title+'","version":"'+Version+'","ipport":"WHATSAPP","uptime":"'+Math.floor(uptime/60000)+'"}');
	});
}

/****************************************************************************************************/
/* Le as variáveis de ambiente																		*/
/****************************************************************************************************/
const dotenv = require('dotenv');
dotenv.config();

/****************************************************************************************************/
/* Abre uma instância do whatsapp																	*/
/****************************************************************************************************/
const { Client, LocalAuth, Location, Buttons } = require('whatsapp-web.js');
const whatsapp = new Client({
    puppeteer: {
        headless: false,
        executablePath: `${process.env.CHROME_PATH}`,
        env: {
          DISPLAY: ':0',
        },
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
        ]
      },
	authStrategy: new LocalAuth()
});

const qrcode = require('qrcode-terminal');
whatsapp.on('qr', (qr) => {
    qrcode.generate(qr, {small: true});
});

// Envia o estatus para o SAN assim que a conexão for estabelicida 
whatsapp.on('ready', () => { GetDate().then(dte => { // Imprime no terminal
													 console.log('\033[36m'+dte+': \033[32mWhatsapp conectado.\033[0;0m');
													 console.log('\033[36m'+dte+': \033[32mAguardando clientes...\033[0;0m'); 
													 // Salva data e hora de início
													 starttime = Date.parse(dte);
													 // Publica no SAN
													 PublishUpdate(); 
													});
							});

// Envia uma messagem para um ou mais telefones
async function SendMsg(number, msg) {
	number.split(",").forEach(function(item) {
		let num = item.includes('@c.us') ? item : `${item}@c.us`;
		whatsapp.sendMessage(num, msg);
	});
}

// Trata as messagens que chegam pelo telefone
whatsapp.on('message', async msg => {
	// Pega o numero que enviou
	let num = msg.from.split('@')[0];
	// Vefica se o numero e um ADM ou cliente

	if (true) {
		// Simula o Digitando...
		const chat = await msg.getChat();
		chat.sendStateTyping();

		// Arvore de decisão
		let words = msg.body.toLowerCase().split(" ");
		switch (words[0]) {
			case 'boa' :	
			case 'bom' :
			case 'bon' :
				whatsapp.sendMessage(msg.from, greetingMessages());
				break;
			case '#status':
				hub.publish('san:msg_request','{"number":"'+num+'","msg":"#status"}');
				break;
		}
		// Desliga o Digitando...
		chat.clearState();
	}
});

whatsapp.initialize();

/****************************************************************************************************/
/* Cria e abre uma conexão do Redis																	*/
/****************************************************************************************************/
const Redis = require('ioredis');
const hub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});
const pub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});

pub.on('connect', function () { GetDate().then(dte => {console.log('\033[36m'+dte+': \033[32mHUB conectado.\033[0;0m');}); });

// Se increve nos canais para recebe messagens dos outros serviços
pub.subscribe("msg:device_update","msg:adm_message", (err, count) => {
  if (err) {
	GetDate().then(dte => { console.log('\033[36m'+dte+': \033[31mFalha na inscrição: '+ err.message +'\033[0;0m')});
  } 
});

// Aguarda messagens do redis pelos canais
pub.on("message", (channel, message) => {
	// Converte para objeto
	let obj = JSON.parse(message);
	// Verifica qual o canal e responde 
	switch (channel) {
		case 'msg:adm_message' :
			SendMsg(obj.number, obj.msg);
			break;
  	}
	// Atualiza contadores para estatísticas
	msgsout++;
	bytsout+=obj.msg.length;
});

/****************************************************************************************************/
/* Cria e abre uma conexão MySQL																	*/
/****************************************************************************************************/
const mysql = require('mysql');
const db = mysql.createPool({host:process.env.DB_host, database:process.env.DB_name, user:process.env.DB_user, password:process.env.DB_pass, connectionLimit:10});

// Inicializa contadores pra estatísticas
var starttime=0,numdev=0,msgsin=0,msgsout=0,bytsin=0,bytsout=0,bytserr=0;

// Atualiza estatísticas a cada 60s
setInterval(function() {
			// Publica estatus do serviço no SAN
			PublishUpdate();
			// Pega data e hora
			GetDate().then(dte => {
				// Grava contadores para estatísticas
				db.getConnection(function(err,connection){
					if (!err) {
						connection.query('INSERT INTO syslog (datlog,server,version,ipport,devices,msgsin,msgsout,bytsin,bytsout,bytserr) VALUES (?,?,?,?,?,?,?,?,?,?)',[dte, process.title, Version, 'whatsapp', numdev, msgsin, msgsout, bytsin, bytsout, bytserr],function (err, result) {connection.release(); if (err) err => console.error(err);});
					}
					msgsin=0;
					msgsout=0;
					bytsin=0;
					bytsout=0;
					bytserr=0;
				});
			});
},60000);

/****************************************************************************************************/
/* 	Mostra parâmetros no terminal e fica aguardado clientes											*/
/****************************************************************************************************/
const OS = require('os');
GetDate().then(dte => {
	// Mostra parâmetros no terminal
	console.log('\033[36m'+dte+': \033[37m================================');
	console.log('\033[36m'+dte+': \033[37mAPP : ' + process.title + ' ('+Version+')');
	console.log('\033[36m'+dte+': \033[37mIP/Port : WHATSAPP');
	console.log('\033[36m'+dte+': \033[37mCPUs: '+ OS.cpus().length);
	console.log('\033[36m'+dte+': \033[37m================================\033[0;0m');
});