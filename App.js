const agentBot = require('./lib/agentBot');

//TODO: Hardcoded value's to config file or env variables.
var agent = new agentBot(34252425, "Chatbot", "chatbotessent123!");

agent.start();