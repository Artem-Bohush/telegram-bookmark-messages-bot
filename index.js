const TelegramBot = require('node-telegram-bot-api')
const sqlite = require('sqlite-sync')

sqlite.connect('./db/library.db')
sqlite.run(`CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  from_id INTEGER NOT NULL,
  message_id INTEGER NOT NULL
  )`, (res) => {
  if (res.error) {
    throw res.error
  }
})

if (sqlite.run('SELECT * FROM messages').length) {
  console.log('Existing: ', sqlite.run('SELECT * FROM messages'));
} else {
  sqlite.insert('messages', { key: 'test', from_id: 366344778, message_id: 42 }, (res) => {
    if (res.error) {
      throw res.error
    }
    console.log('Just created: ', sqlite.run('SELECT * FROM messages'));
  })
}

//

function isMessageExists(key) {
  return sqlite.run('SELECT COUNT(*) as cnt FROM messages WHERE `key` = ?', [key])[0].cnt !== 0;
}

function getMessage(key) {
  const data = sqlite.run('SELECT * FROM messages WHERE `key` = ? LIMIT 1', [key]);
  if (data.length === 0) {
    return { exists: false }
  }
  data[0].exists = true
  return data[0]
}

//

const token = '1386297206:AAGdrV7VlOfse8yIXvRkvrBcrY-AkT1rluI'
const bot = new TelegramBot(token, { polling: true })

bot.onText(/\/get ([^;'"]+)/, (msg, match) => {
  const chatId = msg.chat.id
  const key = match[1]
  const message = getMessage(key)
  if (message.exists) {
    bot.forwardMessage(chatId, message.from_id, message.message_id)
  }
})

const addMode = {};

bot.onText(/\/add ([^;'"]+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const key = match[1];
  let text;
  if (isMessageExists(key)) {
    text = 'Sorry, message with this key already exists.';
  } else {
    addMode[chatId] = { key, from: msg.from.id };
    text = 'Now send me a message that needs to be saved. '
      + 'Or /cancel to abort operation.';
  }
  bot.sendMessage(chatId, text);
});

bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  if (!(chatId in addMode)) {
    return;
  }

  if (typeof msg.text !== 'undefined' && msg.text.toLowerCase() === '/cancel') {
    delete addMode[msg.chat.id];
    return;
  }

  const row = addMode[chatId];

  sqlite.insert('messages', {
    key: row.key,
    from_id: row.from,
    message_id: msg.message_id,
  }, (res) => {
    if (res.error) {
      bot.sendMessage(chatId, 'Unable to bookmark message. Please, try again later.');
    }
    bot.sendMessage(chatId, 'Message successfully saved!');
  });

  delete addMode[chatId];
});
