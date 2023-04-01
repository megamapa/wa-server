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

// Publish update status
async function PublishUpdate() {
	san.publish('san:server_update','{"name":"'+process.title+'","version":"'+Version+'","uptime":"'+Math.floor(OS.uptime()/60)+'"}');
}

// Initialize global variables
var numdev=0,msgsin=0,msgsout=0,bytsin=0,bytsout=0,bytserr=0;

// Update statistics ever 60s
setInterval(function() {
			// Get datetime
			let dte = new Date(new Date().getTime()).toISOString().replace(/T/,' ').replace(/\..+/, '');
			// Publish update status
			PublishUpdate();
			// Update database
			db.getConnection(function(err,connection){
				if (!err) {
					connection.query('INSERT INTO syslog (datlog,server,version,ipport,devices,msgsin,msgsout,bytsin,bytsout,bytserr) VALUES (?,?,?,?,?,?,?,?,?,?)',[dte, process.title, Version, process.env.SrvIP + ':' + process.env.SrvPort, numdev, msgsin, msgsout, bytsin, bytsout, bytserr],function (err, result) {connection.release(); if (err) err => console.error(err);});
				}
				msgsin=0;
				msgsout=0;
				bytsin=0;
				bytsout=0;
				bytserr=0;
			});
},60000);

// Read enviroment variables
const dotenv = require('dotenv');
dotenv.config();

// Create and open Redis connection
const Redis = require('ioredis');
const san = new Redis({host:process.env.RD_host, port:process.env.RD_port, showFriendlyErrorStack: true });

// Updates server status as soon as it successfully connects
san.on('connect', function () { PublishUpdate(); });

// Create and open MySQL connection
const mysql = require('mysql');
const db = mysql.createPool({host:process.env.DB_host, database:process.env.DB_name, user:process.env.DB_user, password:process.env.DB_pass, connectionLimit:10});

/****************************************************************************************************/
/* Open whatsapp instance																			*/
/****************************************************************************************************/
const { Client } = require('whatsapp-web.js');

const client = new Client();

client.on('qr', (qr) => {
    // Generate and scan this code with your phone
    console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
    console.log('Client is ready!');
});

client.on('message', msg => {
    if (msg.body == '!ping') {
        msg.reply('pong');
    }
});

client.initialize();

// Show parameters and waiting clients
const OS = require('os');
GetDate().then(dte => {
	console.log('\033[1;30m'+dte+': \033[0;31m================================');
	console.log('\033[1;30m'+dte+': \033[0;31m' + 'APP : ' + process.title + ' ('+Version+')');
	console.log('\033[1;30m'+dte+': \033[0;31m' + 'CPUs: '+ OS.cpus().length);
	console.log('\033[1;30m'+dte+': \033[0;31m================================');
	console.log('\033[1;30m'+dte+': \033[0;31mWaiting clients...\033[0;0m');});