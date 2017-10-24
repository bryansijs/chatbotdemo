const agentBot = require('./lib/agentBot');

//TODO: Hardcoded value's to config file or env variables.
// please be and dont steal this (:
const agent = new agentBot(63494234, "essentBot", "essent123");

agent.start();
