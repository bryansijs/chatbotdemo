'use strict';

const util = require('util');
const request = require('request');
const config = require('../config/config');
const Wit = require('node-wit').Wit;


function getNextPingURL(linkArr) {
    for (let i = 0; i < linkArr.length; i++) {
        const link = linkArr[i];
        if (link['@rel'] === 'next') {
            return link['@href'].replace('/events', '/events.json');
        }
    }
}

class AgentChat {

    constructor(session, chatURL) {
        const actions = {
            transfer_to_agent(context, entities) {
                console.log('TRANSFER_TO_AGENT');
                console.log(context);
                console.log(entities);
            },
            send(request, response) {
                const {sessionId, context, entities} = request;
                const {text, quickreplies} = response;
                console.log('user said...', request.text);
                console.log('sending...', JSON.stringify(response));
            }
        };

        this.client = new Wit({accessToken: '6DU6367QOJMURX53LKNYMK3KF523BO2I',actions});
        this.session = session;
        this.chatURL = chatURL;
        this.lineIndex = 0;
        this.chatPingInterval = 2000;
    }

    start(callback) {
        this.startChatSession((err, data) => {
            if (err) {
                callback(err);
            }
            else {
                callback(null);
                this.chatLink = data.chatLink;
                this.chatPolling();
            }
        });
    }

    startChatSession(callback) {
        console.log(`(startChatSession) In linkForNextChat: ${this.chatURL}`);

        let body = {'chat': 'start'};
        this.agentRequest('POST', `${this.chatURL}.json?v=1&NC=true`, body, (err, body) => {
            if (err) {
                callback(`Failed to start chat session with error: ${JSON.stringify(error)}`);
            }
            else {
                console.log(`Start chat session - body: ${body.chatLocation.link['@href']}`);
                callback(null, {
                    chatLink: body.chatLocation.link['@href']
                });
            }
        });
    }

    chatPolling(url) {
        if (!url) {
            url = this.chatLink + '.json?v=1&NC=true'
        }

        const options = {
            method: 'GET',
            url: url,
            headers: {
                'Authorization': `Bearer ${this.session.getBearer()}`,
                'content-type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            json:true
        };

        request(options, (error, response, body)=> {
            if (error) {
                console.error(`Agent polling failed. Error: ${JSON.stringify(error)}`);
                return;
            }
            else if(response.statusCode < 200 || response.statusCode > 299){
                console.error(`Agent polling failed response. body: ${JSON.stringify(body)}`);
                return;
            }
            let events;
            let nextURL;

            if (body.chat && body.chat.error) {
                console.log(`Chat error: ${JSON.stringify(body.chat.error)}`);
                return;
            }

            if (body.chat && body.chat.events) {
                nextURL = `${getNextPingURL(body.chat.events.link)}&v=1&NC=true`;
                events = body.chat['events']['event'];
            }
            else {
                try {
                    nextURL = `${getNextPingURL(body.events.link)}&v=1&NC=true`;
                }
                catch (e) {
                    console.log(`Error getting the next URL link: ${e.message}, body=${JSON.stringify(body)}`);
                    return;
                }
                events = body['events']['event'];
            }

            if (events) {
                if (!Array.isArray(events)) { // The API send an object and not an array if there is 1 event only
                    events = [events];
                }
                for (let i = 0; i < events.length; i++) {
                    const ev = events[i];

                    if ((ev['@type'] === 'state') && (ev.state === 'ended')) {
                        return;
                    }
                    else if ((ev['@type'] === 'line') && (ev['source'] === 'visitor')) {
                        console.log(`(chatPolling) - line form visitor:${ev.text}`);

                        this.sentimentIsAcceptable(ev.text, (badSentiment) => {
                           if(badSentiment){
                               this.sendCustomerToAgent();
                           } else {
                               this.sendLine(ev.text);
                           }
                        });

                    }
                }
            }
            this.chatTimer = setTimeout(() => {
                this.chatPolling(nextURL);
            }, this.chatPingInterval);
        });
    }

    sentimentIsAcceptable(visitorText,callback){
        const options = {
            method: 'POST',
            url: 'https://westus.api.cognitive.microsoft.com/text/analytics/v2.0/sentiment',
            headers: {
                'content-type': 'application/json',
                'Accept': 'application/json',
                'Ocp-Apim-Subscription-Key' : 'b2368e554d75468cab5848cc902f5f59'
            },
            json:true,
            body:{
                "documents": [
                    {
                        "language": "nl",
                        "id": "1234",
                        "text": visitorText
                    }
                ]
            }
        };

        request(options, (error, response, body)=> {
            if (error) {
                console.error(`Agent polling failed. Error: ${JSON.stringify(error)}`);
                callback(error);
            }
            else if(response.statusCode < 200 || response.statusCode > 299){
                console.error(`Agent polling failed response. body: ${JSON.stringify(body)}`);
                callback(true);
            }
            else {
                console.log("UserText: " + visitorText + " score: " + body.documents[0].score);

                if(body.documents[0].score < 0.5){
                    callback(true);
                } else {
                    callback();
                }
            }
        });
    }

    sendLine(visitorText) {
        // Customer sended text
        console.log('SESSION:' + this.session);
        console.log(visitorText);

        // Get response from Wit.ai
        this.client.converse(this.chatLink, visitorText, {})
            .then((data) => {
                console.log('Yay, got Wit.ai response: ' + JSON.stringify(data));
                var line = data.msg;


                if (!line) {
                    //check if action is triggert:

                    //TODO: check other types and make it a switch/case: merge (first bot action after a user message), msg (the bot has something to say), action (the bot has something to do) or stop (the bot is waiting to proceed).
                    if(data.type === "action"){
                        switch (data.action) {
                            case "transfer_to_agent":
                                console.log("sending to agent");
                                this.sendCustomerToAgent();
                                break;
                            default:
                                line = `action is triggerd: ${data.action}`;
                        }

                    } else if(data.type === "stop"){
                        this.stop(err => {
                            if (err) {
                                console.log(`Error stopping chat err: ${err.message}`);
                            }
                        });
                        return;
                    }
                }

                console.log(`Sending line: ${line}`);

                setTimeout(() => {
                    let body = {
                        event: {
                            '@type': 'line',
                            'text': `<p dir='ltr' style='direction: ltr; text-align: left;'>${line}</p>`,
                            'textType': 'html'
                        }
                    };
                    this.agentRequest('POST',`${this.chatLink}/events.json?v=1&NC=true`,body,(error,body)=>{
                        this.lineIndex++;
                        if (error) {
                            console.log(`Error sending line. Error: ${JSON.stringify(error)}`);
                        }
                        else {
                            console.log(`Send line: ${JSON.stringify(body)}`);
                        }
                    });
                }, config.chat.minLineWaitTime);
            })
            .catch(console.error);
    }

    stop(callback) {
        clearTimeout(this.chatTimer);
        clearTimeout(this.incomingTimer);

        if (this.chatLink) {
            let body = {
                event: {
                    '@type': 'state',
                    'state': 'ended'
                }
            };
            this.agentRequest('POST',`${this.chatLink}/events.json?v=1&NC=true`,body,(error,body)=>{
                if (error) {
                    callback(`Error trying to end chat: ${JSON.stringify(error)}`);
                }
                else {
                    this.session.stop(err => {
                        if (err) {
                            console.log(`Error stopping session: ${err.message}`);
                            callback(err);
                        }
                        else {
                            callback();
                        }
                    });
                }
            });
        }else{
            callback(`Chat link is unavailable chatLink: ${this.chatLink}`);
        }
    }

    sendCustomerToAgent(callback){
        console.log("chatlink: " + this.chatLink);
        if (this.chatLink) {
            let body = {
                "transfer": {
                    "skill":
                        {
                            "id": 943999232
                        }
                    ,
                    "text" : "I think this person needs some help from you."
                }
            };
            this.agentRequest('POST',`${this.chatLink}/transfer?v=1&NC=true`,body,(error,body)=>{
                if (error) {
                    callback(`Error trying to transfer chat: ${JSON.stringify(error)}`);
                }
            });
        } else {
            callback(`Chat link is unavailable in sendCustomerToAgent: ${this.chatLink}`);
        }
    }

    agentRequest(method, url, body, callback) {
        const options = {
            method: method,
            url: `${url}`,
            headers: {
                'Authorization': `Bearer ${this.session.getBearer()}`,
                'content-type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            json: true
        };
        if (body) {
            options.body = body;
        }
        if (method === 'PUT' || method === 'DELETE') {
            options.headers['X-HTTP-Method-Override'] = method;
            options.method = 'POST';
        }

        request(options, (error, response, body) => {
            if (error) {
                callback(error);
            }
            else if(response.statusCode < 200 || response.statusCode > 299){
                callback(error);
            }

            callback(null, body, response);
        });
    }
}

module.exports = AgentChat;
