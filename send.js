'use strict';

const fs = require('fs');

const glob = require('tiny-glob/sync');

const nodemailer = require('nodemailer');

function getEnv(...names) {

  const result = {};

  names.forEach(name => {
    const value = process.env[name];

    if (!value) {
      console.error(`missing ${name} environment variable`);
      process.exit(1);
    }

    result[name] = value;
  });

  return result;
}

const {
  DISCOURSE_BASE_URL,
  EMAIL_TO,
  EMAIL_REPLY_TO,
  EMAIL_HOST,
  EMAIL_USERNAME,
  EMAIL_PASSWORD
} = getEnv(
  'DISCOURSE_BASE_URL',
  'EMAIL_TO',
  'EMAIL_REPLY_TO',
  'EMAIL_HOST',
  'EMAIL_USERNAME',
  'EMAIL_PASSWORD'
);


const csvs = glob('*.csv');

const transport = nodemailer.createTransport({
  host: EMAIL_HOST,
  secure: true,
  auth: {
    user: EMAIL_USERNAME,
    pass: EMAIL_PASSWORD
  }
});

const message = {
  to: EMAIL_TO,
  replyTo: EMAIL_REPLY_TO,
  subject: `[Forum Statistics] Monthly stats for ${DISCOURSE_BASE_URL}`,
  text: `Find the last months usage stats for ${DISCOURSE_BASE_URL} attached`,
  attachments: csvs.map(path => {
    return {
      filename: path,
      path
    };
  })
};

transport.sendMail(message).then(_ => {
  console.log('mail sent');
}).catch(err => {
  console.error(err);

  process.exit(1);
});