const TelegramBot = require('node-telegram-bot-api')
const sqlite = require('sqlite-sync')
require('dotenv').config({ path: `${__dirname}/config/.env` })

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

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true })

// Retrieve message from database
bot.onText(/\/get ([^;'"]+)/, (msg, match) => {
  const chatId = msg.chat.id
  const key = match[1]
  const message = getMessage(key)
  if (message.exists) {
    bot.forwardMessage(chatId, message.from_id, message.message_id)
  }
})

// Add message to database
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

// Get list of messages for current user
bot.onText(/\/list/, (msg) => {
  const chatId = msg.chat.id;
  const fromId = msg.from.id;
  const data = sqlite.run('SELECT `key` FROM messages WHERE `from_id` = ?', [fromId]);
  if (data.length === 0) {
    bot.sendMessage(chatId, 'You have not added anything.');
    return;
  }
  const lines = [];
  data.forEach((element) => {
    lines.push(`\`${element.key}\``);
  });
  bot.sendMessage(chatId, lines.join(', '), { parse_mode: 'markdown' });
});

// Remove message from database
bot.onText(/\/remove ([^;'"]+)/, (msg, match) => {
  const key = match[1];
  const message = getMessage(key);
  if (!message.exists) return;
  if (message.from_id !== msg.from.id) return;

  sqlite.delete('messages', { key }, (res) => {
    if (!res.error) {
      bot.sendMessage(msg.chat.id, 'Message successfully deleted!');
    }
  });
});
