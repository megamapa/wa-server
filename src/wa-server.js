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
		pub.publish('san:server_update','{"name":"'+process.title+'","version":"'+Version+'","ipport":"WHATSAPP","uptime":"'+Math.floor(uptime/60000)+'"}');
	});
}

// Send message to whatsapp
async function SendMsg(number, message) {
	let num = number.includes('@c.us') ? number : `${number}@c.us`;
	whatsapp.sendMessage(num, message);
}

/****************************************************************************************************/
/* Read enviroment variables																		*/
/****************************************************************************************************/
const dotenv = require('dotenv');
dotenv.config();

/****************************************************************************************************/
/* Create and open Redis connection																	*/
/****************************************************************************************************/
const Redis = require('ioredis');
const hub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});
const pub = new Redis({host:process.env.RD_host, port:process.env.RD_port, password:process.env.RD_pass});

// Updates server status as soon as it successfully connects
hub.on('connect', function () { PublishUpdate(); GetDate().then(dte => {console.log('\033[30m'+dte+': \033[32mHUB connected.\033[0;0m');}); });
//hub.set('msg:5511930141514','{"context":"null","last":"0"}');
// Subscribe
hub.subscribe("msg:device_update","msg:san_message", (err, count) => {
  if (err) {
	console.log('\033[30m'+dte+': \033[31mFailed to subscribe: '+ err.message +'\033[0;0m');
  } 
});

// Waiting messages
hub.on("message", (channel, message) => {
	// Converte para objeto
	let obj = JSON.parse(message);
	// Envia a msg
	switch (channel) {
		case 'msg:device_update' :
			SendMsg(obj.num, obj.msg);
			break;

		case 'msg:san_message' :
			SendMsg(process.env.WA_chanel, obj.msg);
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
/* Open whatsapp instance																			*/
/****************************************************************************************************/
const { Client, LocalAuth, Location, Buttons } = require('whatsapp-web.js');
const whatsapp = new Client({
    puppeteer: { headless: false },
	authStrategy: new LocalAuth()
});

const qrcode = require('qrcode-terminal');
whatsapp.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

whatsapp.on('ready', () => {
	GetDate().then(dte => {	console.log('\033[30m'+dte+': \033[32mWhatsapp connected.\033[0;0m');
							console.log('\033[30m'+dte+': \033[32mWaiting clients...\033[0;0m'); });
});

const _bom_x = 1;
const _oi = 2;

async function SendMsg(number, message) {
	let num = number.includes('@c.us') ? number : `${number}@c.us`;
	whatsapp.sendMessage(num, message);
}

whatsapp.on('message', async msg => {
	// Get sender
	let num = msg.from.split('@')[0];
	// Verifica se existe
	hub.exists('msg:'+num, async function (err, result) {
		if (result) {
			// Simulates typing in the chat
			const chat = await msg.getChat();
			chat.sendStateTyping();

			let res = 0;
			// Check words
			let words = msg.body.toLowerCase().split(" ");
			words.map(w => {
				switch (w) {
					case 'oi' :
					case 'ola' :
					case 'ai' :
					case 'conseguiu' :
						res = _oi;
						break;

					case 'boa' :	
					case 'bom' :
					case 'bon' :
						res = _bom_x;
						break;
	
				}
			});
			// stops typing in the chat
			chat.clearState();	
			if (res==_bom_x) {whatsapp.sendMessage(msg.from, greetingMessages());}

		}
	});
});

whatsapp.initialize();

/****************************************************************************************************/
/* 	Show parameters and waiting clients																*/
/****************************************************************************************************/
const OS = require('os');
GetDate().then(dte => {
	// Save start datetime
	starttime = Date.parse(dte);
	// Show parameters and waiting clients
	console.log('\033[30m'+dte+': \033[37m================================');
	console.log('\033[30m'+dte+': \033[37m' + 'APP : ' + process.title + ' ('+Version+')');
	console.log('\033[30m'+dte+': \033[37m' + 'IP/Port : WHATSAPP');
	console.log('\033[30m'+dte+': \033[37m' + 'CPUs: '+ OS.cpus().length);
	console.log('\033[30m'+dte+': \033[37m================================\033[0;0m');});