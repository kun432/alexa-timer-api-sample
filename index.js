// This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
// Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
// session persistence, api calls, and more.

const Alexa = require('ask-sdk-core');
const PERMISSION = 'alexa::alerts:timers:skill:readwrite';

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    let speechOutput = 'タイマーのサンプルにようこそ。';

    let response = verifyConsentToken(handlerInput);
    if (response) return response;
      
    speechOutput += 'このスキルでは、５分のタイマーをセットして、のようにタイマーの時間を設定することができます。どうしますか？';
    return handlerInput.responseBuilder
        .speak(speechOutput)
        .reprompt(speechOutput)
        .getResponse();
  }
};

function verifyConsentToken(handlerInput){
  const {permissions} = handlerInput.requestEnvelope.context.System.user;
  if (!(permissions && permissions.consentToken)){
    return handlerInput.responseBuilder
            .addDirective({
              type: 'Connections.SendRequest',
              'name': 'AskFor',
              'payload': {
                '@type': 'AskForPermissionsConsentRequest',
                '@version': '1',
                'permissionScope': PERMISSION
              },
              token: ''
        }).getResponse();
   }
  return null;
}

const SetTimerIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'setTimerIntent';
    },
    async handle(handlerInput) {
        let response = verifyConsentToken(handlerInput);
        if (response) return response;

        const duration = Alexa.getSlotValue(handlerInput.requestEnvelope, 'duration');
        const timer = {
            duration: duration,
            label: 'タイマーのお知らせ',
            creationBehavior: {
                displayExperience: {
                    visibility: 'VISIBLE'
                }
            },
            triggeringBehavior: {
                operation: {
                    type : 'ANNOUNCE',
                    textToAnnounce: [{
                        locale: 'ja-JP',
                        text: 'お知らせです。'
                    }]
                },
                notificationConfig: {
                    playAudible: true
                }
            }
        };
        
        try {
            const timerServiceClient = handlerInput.serviceClientFactory.getTimerManagementServiceClient();
            const timersList = await timerServiceClient.getTimers();
            console.log('現在のタイマー一覧: ' + JSON.stringify(timersList));
            const timerResponse = await timerServiceClient.createTimer(timer);
            console.log('タイマー作成結果: ' + JSON.stringify(timerResponse));
            
            const timerId = timerResponse.id;
            const timerStatus = timerResponse.status;

            if (timerStatus === 'ON') {
                const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
                sessionAttributes['lastTimerId'] = timerId;
                return handlerInput.responseBuilder
                    .speak('タイマーは起動中です。確認したい場合は、タイマーをチェックして。と言ってみてください。次は、どうしますか？')
                    .reprompt('次は、どうしますか？')
                    .getResponse();
            } else {
                throw { statusCode: 308, message: 'Timer did not start' };
            }
        } catch (error) {
            console.log('タイマー作成エラー: ' + JSON.stringify(error));
            return handlerInput.responseBuilder
                    .speak('タイマーのセットに失敗しました。ごめんなさい。次は、どうしますか？')
                    .reprompt('次は、どうしますか？')
                    .getResponse();
        }
    }
};

const ReadTimerIntentHandler = {
  canHandle(handlerInput) {
      return handlerInput.requestEnvelope.request.type === 'IntentRequest'
          && handlerInput.requestEnvelope.request.intent.name === 'readTimerIntent';
  },
  async handle(handlerInput) {
      const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
      let timerId = sessionAttributes['lastTimerId'];

      try {
          const timerServiceClient = handlerInput.serviceClientFactory.getTimerManagementServiceClient();
          const timersList = await timerServiceClient.getTimers();
          console.log('タイマー一覧: ' + JSON.stringify(timersList));

          const totalCount = timersList.totalCount;
          const preText = totalCount ? `現在、${totalCount}個のタイマーがセットされています。` : '';
          if(timerId || totalCount > 0) {
              timerId = timerId ? timerId : timersList.timers[0].id; 
              const timerResponse = await timerServiceClient.getTimer(timerId);       
              console.log('タイマー応答: ' + JSON.stringify(timerResponse));
              const timerStatus = timerResponse.status;
              let status;
              switch (timerStatus) {
                  case 'ON':
                      status = '起動中です';
                      break;
                  case 'OFF':
                      status = 'オフになっています';
                      break;
                  case 'PAUSED':
                      status = '停止中です';
                      break;
              }
              return handlerInput.responseBuilder
                  .speak(preText + `お客様のタイマーは、現在 ${status}。次は、どうしますか？`)
                  .reprompt('次は、どうしますか？')
                  .getResponse();
          } else {
              return handlerInput.responseBuilder
                  .speak(preText + '現在、タイマーがセットされていません。タイマーをセットして、と言ってみてください。次は、どうしますか？')
                  .reprompt('次は、どうしますか？')
                  .getResponse();
          }
      } catch (error) {
          console.log('タイマー読み取りエラー: ' + JSON.stringify(error));
          return handlerInput.responseBuilder
                     .speak('タイマーの状態を調べるのに失敗しました。ごめんなさい。次は、どうしますか？')
                     .reprompt('次は、どうしますか？')
                     .getResponse();
      }
  }
}

const AskForResponseHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'Connections.Response'
        && handlerInput.requestEnvelope.request.name === 'AskFor';
  },
  async handle(handlerInput) {
    const { payload, status } = handlerInput.requestEnvelope.request;

    if (status.code === '200') {
      switch (payload.status) {
        case 'ACCEPTED':
          handlerInput.responseBuilder
            .speak('それでは、セットしたい時間で、「何分のタイマーをセットして」のように言ってみてください。次は、どうしますか？')
            .reprompt('次はどうしますか？');
          break;
        case 'DENIED':
        case 'NOT_ANSWERED':
          handlerInput.responseBuilder
            .speak('タイマーの使用許可をいただけなかったので、このスキルを続けることができません。後ほどもう一度お試しください。バイバイ');
          break;
      }
      if(payload.status !== 'ACCEPTED' && !payload.isCardThrown){
        handlerInput.responseBuilder
          .speak('お客様のAlexaアプリに、このスキルがタイマーを使用することを許可するためのカードを送りました。権限を許可していただいた後に、もう一度このスキルを呼び出してください。')
          .withAskForPermissionsConsentCard([PERMISSION]);
      }
      return handlerInput.responseBuilder.getResponse();
    }

    if (status.code === '400') console.log('スキルに権限設定がされていません');

    console.log(`Connections.Responseエラー: ${status.message}`);

    return handlerInput.responseBuilder
        .speak('タイマーの使用許可をいただく途中でエラーが起きてしまいました。後ほどもう一度お試しください。バイバイ')
        .getResponse();
  }
};

const PauseTimerIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.PauseIntent';
    },
    async handle(handlerInput) {
        const timerServiceClient = handlerInput.serviceClientFactory.getTimerManagementServiceClient();

        try {
            const timersList = await timerServiceClient.getTimers();
            console.log('現在のタイマー一覧: ' + JSON.stringify(timersList));
            const totalCount = timersList.totalCount;

            if(totalCount === 0) {
                return handlerInput.responseBuilder
                    .speak('現在、タイマーはセットされていません。タイマーをセットして、と言ってみてください。次は、どうしますか？')
                    .reprompt('次は、どうしますか？')
                    .getResponse();
            }
            // ループですべてのタイマーを停止
            timersList.timers.forEach(async (timer) => {
                if(timer.status === 'ON'){
                    await timerServiceClient.pauseTimer(timer.id);
                }
            });
            return handlerInput.responseBuilder
                .speak('タイマーを停止しました。再開する場合は、タイマーを再開して。と言ってください。次は、どうしますか？')
                .reprompt('次は、どうしますか？')
                .getResponse();
        } catch (error) {
            console.log('タイマー停止エラー: ' + JSON.stringify(error));
            return handlerInput.responseBuilder
                .speak('タイマーの停止に失敗しました。ごめんなさい。次は、どうしますか？')
                .reprompt('次は、どうしますか？')
                .getResponse();
        }
    }
}

const ResumeTimerIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'AMAZON.ResumeIntent';
    },
    async handle(handlerInput) {
        const timerServiceClient = handlerInput.serviceClientFactory.getTimerManagementServiceClient();
        
        try {
            const timersList = await timerServiceClient.getTimers();
            console.log('現在のタイマー一覧: ' + JSON.stringify(timersList));
            const totalCount = timersList.totalCount;

            if(totalCount === 0) {
                return handlerInput.responseBuilder
                    .speak('現在、タイマーはセットされていません。タイマーをセットして、と言ってみてください。次は、どうしますか？')
                    .reprompt('次は、どうしますか？')
                    .getResponse();
            }
            // ループですべてのタイマーを再開
            timersList.timers.forEach(async (timer) => {
                if(timer.status === 'PAUSED'){
                    await timerServiceClient.resumeTimer(timer.id);
                }
            });
            return handlerInput.responseBuilder
                .speak('タイマーを再開しました。再び停止させたい場合は、タイマーを停止して、と言ってください。 ')
                .reprompt('次は、どうしますか？')
                .getResponse();
        } catch (error) {
            console.log('Resume timer error: ' + JSON.stringify(error));
            return handlerInput.responseBuilder
                .speak('タイマーの停止に失敗しました。ごめんなさい。次は、どうしますか？')
                .reprompt('次は、どうしますか？')
                .getResponse();
        }
    }
}

const DeleteTimerIntentHandler = {
    canHandle(handlerInput) {
        return handlerInput.requestEnvelope.request.type === 'IntentRequest'
            && handlerInput.requestEnvelope.request.intent.name === 'deleteTimerIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let timerId = sessionAttributes['lastTimerId'];

        try {
            const timerServiceClient = handlerInput.serviceClientFactory.getTimerManagementServiceClient();
            const timersList = await timerServiceClient.getTimers();
            console.log('現在のタイマー一覧: ' + JSON.stringify(timersList));
            
            const totalCount = timersList.totalCount;
            if(totalCount === 0) {
                return handlerInput.responseBuilder
                    .speak('現在、タイマーはセットされていません。タイマーをセットして、と言ってみてください。次は、どうしますか？')
                    .reprompt('次は、どうしますか？')
                    .getResponse();
            }
            if(timerId) {
                await timerServiceClient.deleteTimer(timerId);
            } else {
                // すべてのタイマーを削除
                await timerServiceClient.deleteTimers();
            }
            return handlerInput.responseBuilder
                .speak('タイマーは削除されました。別のタイマーをセットしたい場合は、「何分のタイマーをセットして」のように言ってみてください。次は、どうしますか？')
                .reprompt('次は、どうしますか？')
                .getResponse();
        } catch (error) {
            console.log('タイマー削除エラー: ' + JSON.stringify(error));
            return handlerInput.responseBuilder
                .speak('タイマーの削除に失敗しました。ごめんなさい。次は、どうしますか？')
                .reprompt('次は、どうしますか？')
                .getResponse();
        }
    }
}

const HelloWorldIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'HelloWorldIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Hello World!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'You can say hello to me! How can I help?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Goodbye!';
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse();
    }
};

// The intent reflector is used for interaction model testing and debugging.
// It will simply repeat the intent the user said. You can create custom handlers
// for your intents by defining them above, then also adding them to the request
// handler chain below.
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speakOutput = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

// Generic error handling to capture any syntax or routing errors. If you receive an error
// stating the request handler chain is not found, you have not implemented a handler for
// the intent being invoked or included it in the skill builder below.
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        console.log(`~~~~ Error handled: ${error.stack}`);
        const speakOutput = `Sorry, I had trouble doing what you asked. Please try again.`;

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

// The SkillBuilder acts as the entry point for your skill, routing all request and response
// payloads to the handlers above. Make sure any new handlers or interceptors you've
// defined are included below. The order matters - they're processed top to bottom.
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        SetTimerIntentHandler,
        ReadTimerIntentHandler,
        AskForResponseHandler,
        PauseTimerIntentHandler,
        ResumeTimerIntentHandler,
        DeleteTimerIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler, // make sure IntentReflectorHandler is last so it doesn't override your custom intent handlers
    )
    .addErrorHandlers(
        ErrorHandler,
    )
    .withApiClient(new Alexa.DefaultApiClient())
    .lambda();
