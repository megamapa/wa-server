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

// Publish update status
async function PublishUpdate() {
	GetDate().then(dte => {
		let uptime = Date.parse(dte) - starttime;
		hub.publish('san:server_update','{"name":"'+process.title+'","version":"'+Version+'","ipport":"WHATSAPP","uptime":"'+Math.floor(uptime/60000)+'"}');
	});
}

/****************************************************************************************************/
/* Read enviroment variables																		*/
/****************************************************************************************************/
const dotenv = require('dotenv');
dotenv.config();

/****************************************************************************************************/
/* Open whatsapp instance																			*/
/****************************************************************************************************/
const { Client, LocalAuth, Location, Buttons } = require('whatsapp-web.js');
const whatsapp = new Client({
    puppeteer: { headless: false, args: ["--no-sandbox", "--disabled-setupid-sandbox"]},
	authStrategy: new LocalAuth()
});

const qrcode = require('qrcode-terminal');
whatsapp.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

whatsapp.on('ready', () => {
	GetDate().then(dte => {	console.log('\033[36m'+dte+': \033[32mWhatsapp connected.\033[0;0m');
							console.log('\033[36m'+dte+': \033[32mWaiting clients...\033[0;0m'); });
});

// Send message to whatsapp
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
});

whatsapp.initialize();

/****************************************************************************************************/
/* Create and open Redis connection																	*/
/****************************************************************************************************/
const Redis = require('ioredis');
const hub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});
const pub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});

// Updates server status as soon as it successfully connects
pub.on('connect', function () { PublishUpdate(); GetDate().then(dte => {console.log('\033[36m'+dte+': \033[32mHUB connected.\033[0;0m');}); });

// Subscribe

pub.subscribe("msg:device_update","msg:adm_message", (err, count) => {
  if (err) {
	console.log('\033[36m'+dte+': \033[31mFailed to subscribe: '+ err.message +'\033[0;0m');
  } 
});

// Waiting messages
pub.on("message", (channel, message) => {
	// Converte para objeto
	let obj = JSON.parse(message);
	// Envia a msg
	switch (channel) {
		case 'msg:adm_message' :
			SendMsg(obj.number, obj.msg);
			break;
  	}
	// Atualiza contadores
	msgsout++;
	bytsout+=obj.msg.length;
});

/****************************************************************************************************/
/* Create and open MySQL connection																	*/
/****************************************************************************************************/
const mysql = require('mysql');
const db = mysql.createPool({host:process.env.DB_host, database:process.env.DB_name, user:process.env.DB_user, password:process.env.DB_pass, connectionLimit:10});

// Initialize global variables
var starttime=0,numdev=0,msgsin=0,msgsout=0,bytsin=0,bytsout=0,bytserr=0;

// Update statistics ever 60s
setInterval(function() {
			// Get datetime
			let dte = new Date(new Date().getTime()).toISOString().replace(/T/,' ').replace(/\..+/, '');
			// Publish update status
			PublishUpdate();
			// Update database
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
},60000);

/****************************************************************************************************/
/* 	Show parameters and waiting clients																*/
/****************************************************************************************************/
const OS = require('os');
GetDate().then(dte => {
	// Save start datetime
	starttime = Date.parse(dte);
	// Show parameters and waiting clients
	console.log('\033[36m'+dte+': \033[37m================================');
	console.log('\033[36m'+dte+': \033[37mAPP : ' + process.title + ' ('+Version+')');
	console.log('\033[36m'+dte+': \033[37mIP/Port : WHATSAPP');
	console.log('\033[36m'+dte+': \033[37mCPUs: '+ OS.cpus().length);
	console.log('\033[36m'+dte+': \033[37m================================\033[0;0m');});