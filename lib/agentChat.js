'use strict';
const sentimentAnalyser = require('essentiment-analyzer');
const util = require('util');
const request = require('request');
const config = require('../config/config');
const Diagflow = require('apiai');


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
        // todo: no hardcoded keys in code (obviously)
        this.analyser = new sentimentAnalyser('westeurope', '61dcc7cde99b48e58f6ff4891a9cc46a');
        this.apiAi = Diagflow("744ed4ea55384b0fa6ac261bbc0f0a90");

        this.session = session;
        this.chatURL = chatURL;
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

        let body = { 'chat': 'start' };
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
                'content-type': 'apiAilication/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            json: true
        };

        request(options, (error, response, body) => {
            if (error) {
                console.error(`Agent polling failed. Error: ${JSON.stringify(error)}`);
                return;
            }
            else if (response.statusCode < 200 || response.statusCode > 299) {
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

                        this.analyser.analyseMessage(ev.text, 'nl', 0.3, 1234, (sentimentBelowThreshold) => {
                            if (sentimentBelowThreshold) {
                                console.log('*** Sentiment is below threshold, transferring to agent ***');
                                this.sendResponseToLivePerson("Ik merk dat je niet heel tevreden bent, ik ga je verbinden met een van onze medewerkers")
                                this.sendCustomerToAgent()
                            }
                            else if (typeof (sentimentBelowThreshold) !== "boolean") {
                                console.log('*** error occured during sentiment check transferring to agent ***');
                                console.log(sentimentBelowThreshold);
                                this.sendCustomerToAgent()
                            }
                            else {
                                console.log('sentiment is good enough, sending message');
                                this.sendLineToApiAi(ev.text)
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


    sendLineToApiAi(visitorText) {
        // Customer send text
        console.log('SESSION:' + this.session);
        console.log(visitorText);

        const ApiAiRequest = this.apiAi.textRequest(visitorText, {
            // todo make this unique
            sessionId: '123456'
        });


        ApiAiRequest.on('response', ((response) => {
            console.log('got api.ai response');
            console.log(response);

            const apiAiResponseLine = response.result.fulfillment.speech;

            if (apiAiResponseLine) {
                setTimeout(() => {
                    this.sendResponseToLivePerson(apiAiResponseLine)
                }, config.chat.minLineWaitTime);

            }
            else {
                console.warn('something went wrong with api.ai response, transferring to agent')
                this.sendCustomerToAgent()
            }

        }));

        ApiAiRequest.on('error', ((error) => {
            console.log(error);
        }));

        ApiAiRequest.end()


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
            this.agentRequest('POST', `${this.chatLink}/events.json?v=1&NC=true`, body, (error, body) => {
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
        }
        else {
            callback(`Chat link is unavailable chatLink: ${this.chatLink}`);
        }
    }

    sendCustomerToAgent(callback) {
        console.log("chatlink: " + this.chatLink);
        if (this.chatLink) {
            let body = {
                "transfer": {
                    "skill":
                        {
                            "id": 943999232
                        }
                    ,
                    "text": "I think this person needs some help from you."
                }
            };
            this.agentRequest('POST', `${this.chatLink}/transfer?v=1&NC=true`, body, (error, body) => {
                if (error) {
                    callback(`Error trying to transfer chat: ${JSON.stringify(error)}`);
                }
            });
        }
        else {
            callback(`Chat link is unavailable in sendCustomerToAgent: ${this.chatLink}`);
        }
    }

    agentRequest(method, url, body, callback) {
        const options = {
            method: method,
            url: `${url}`,
            headers: {
                'Authorization': `Bearer ${this.session.getBearer()}`,
                'content-type': 'apiAilication/json',
                'Accept': 'apiAilication/json',
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
            else if (response.statusCode < 200 || response.statusCode > 299) {
                callback(error);
            }

            callback(null, body, response);
        });
    }

    sendResponseToLivePerson(apiAiResponseLine) {
        console.log(`Sending line: ${apiAiResponseLine}`);

        const options = {
            method: 'POST',
            url: `${this.chatLink}/events.json?v=1&NC=true`,
            headers: {
                'Authorization': `Bearer ${this.session.getBearer()}`,
                'content-type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            json: true,
            body: {
                event: {
                    '@type': 'line',
                    'text': `<p dir='ltr' style='direction: ltr; text-align: left;'>${apiAiResponseLine}</p>`,
                    'textType': 'html'
                }
            }
        };

        setTimeout(() => {
            request(options, (error, response, body) => {
                if (error) {
                    console.log(`Error sending line. Error: ${JSON.stringify(error)}`);
                }
                else if (response.statusCode < 200 || response.statusCode > 299) {
                    console.log(`Error sending line. Body: ${JSON.stringify(body)}`);

                }
                console.log(`Send line: ${JSON.stringify(body)}`);
            });
        }, config.chat.minLineWaitTime);
    }

}

module.exports = AgentChat;
