var protobuf; // resolved at runtime – see initEnvironment()

(function initEnvironment() {
  const isNode = (typeof process !== 'undefined') && process.versions && process.versions.node && (typeof window === 'undefined');

  if (isNode) {
    // ──────────────────────────────── Node.js ──────────────────────────────
    try {
      protobuf = require('protobufjs');
    } catch (e) {
      console.error('[studioapi] Error loading protobufjs:', e.message);
      throw new Error('[studioapi] Missing dependency "protobufjs" in Node.js: ' + e.message);
    }

    try {
      if (typeof globalThis.p === 'undefined') {
        globalThis.p = require('./studioapi.proto.js');
      }
    } catch (e) {
      throw new Error('[studioapi] Unable to load "./studioapi.proto.js"');
    }

    const g = globalThis;

    if (typeof g.WebSocket === 'undefined') {
      try { g.WebSocket = require('ws'); } catch (_) { /* optional */ }
    }

    if (!g.crypto || !g.crypto.subtle) {
      try { g.crypto = require('crypto').webcrypto; } catch (_) { /* optional */ }
    }

    if (typeof g.TextEncoder === 'undefined' || typeof g.TextDecoder === 'undefined') {
      try {
        const util = require('util');
        g.TextEncoder = util.TextEncoder;
        g.TextDecoder = util.TextDecoder;
      } catch (_) { /* optional */ }
    }

    if (typeof g.URL === 'undefined') {
      try { g.URL = require('url').URL; } catch (_) { /* optional */ }
    }

    if (typeof g.location === 'undefined') {
      g.location = { protocol: 'ws:' };
    }
  } else {
    // ─────────────────────────────── Browser ───────────────────────────────
    if (typeof window !== 'undefined') {
      protobuf = (window.dcodeIO && window.dcodeIO.ProtoBuf) ? window.dcodeIO.ProtoBuf : window.protobuf;
    } else {
      throw new Error('[studioapi] Neither Node.js nor Browser environment detected properly');
    }
  }
})();

/**
 * The studio namespace.
 * @exports studio
 * @namespace
 * @expose
 */
var studio = (function() {
  return {};
})();


/**
 * The studio.protocol namespace.
 * @exports studio.protocol
 * @namespace
 */
studio.protocol = (function(ProtoBuf) {
  var obj = {};
  var root = ProtoBuf.parse(globalThis.p || p).root;

  obj.Hello = root.lookupType("Hello");
  obj.AuthRequest = root.lookupType("AuthRequest");
  obj.AuthRequestChallengeResponse = root.lookupType("AuthRequest.ChallengeResponse");
  obj.AdditionalChallengeResponseRequired = root.lookupType("AdditionalChallengeResponseRequired");
  obj.AuthResponse = root.lookupType("AuthResponse");
  obj.AuthResultCode = root.lookupEnum("AuthResponse.AuthResultCode").values;
  obj.Container = root.lookupType("Container");
  obj.ContainerType = root.lookupEnum("Container.Type").values;
  obj.Error = root.lookupType("Error");
  obj.RemoteErrorCode = root.lookupEnum("RemoteErrorCode").values;
  obj.CDPNodeType = root.lookupEnum("CDPNodeType").values;
  obj.CDPValueType = root.lookupEnum("CDPValueType").values;
  obj.Info = root.lookupType("Info");
  obj.InfoFlags = root.lookupEnum("Info.Flags").values;
  obj.Node = root.lookupType("Node");
  obj.VariantValue = root.lookupType("VariantValue");
  obj.ValueRequest = root.lookupType("ValueRequest");
  obj.EventRequest = root.lookupType("EventRequest");
  obj.EventInfo = root.lookupType("EventInfo");
  obj.EventCode = root.lookupEnum("EventInfo.CodeFlags").values;
  obj.EventStatus = root.lookupEnum("EventInfo.StatusFlags").values;
  obj.ChildAdd = root.lookupType("ChildAdd");
  obj.ChildRemove = root.lookupType("ChildRemove");

  obj.valueToVariant = function (variantValue, type, value) {
    switch (type) {
      case obj.CDPValueType.eDOUBLE:
        variantValue.dValue = value;
        break;
      case obj.CDPValueType.eFLOAT:
        variantValue.fValue = value;
        break;
      case obj.CDPValueType.eUINT64:
        variantValue.ui64Value = value;
        break;
      case obj.CDPValueType.eINT64:
        variantValue.i64Value = value;
        break;
      case obj.CDPValueType.eUINT:
        variantValue.uiValue = value;
        break;
      case obj.CDPValueType.eINT:
        variantValue.iValue = value;
        break;
      case obj.CDPValueType.eUSHORT:
        variantValue.usValue = value;
        break;
      case obj.CDPValueType.eSHORT:
        variantValue.sValue = value;
        break;
      case obj.CDPValueType.eUCHAR:
        variantValue.ucValue = value;
        break;
      case obj.CDPValueType.eCHAR:
        variantValue.cValue = value;
        break;
      case obj.CDPValueType.eBOOL:
        variantValue.bValue = value;
        break;
      case obj.CDPValueType.eSTRING:
        variantValue.strValue = value;
        break;
    }
  };

  obj.valueFromVariant = function(variantValue, type) {
  switch(type) {
    case obj.CDPValueType.eDOUBLE:
      return variantValue.dValue;
    case obj.CDPValueType.eFLOAT:
      return variantValue.fValue;
    case obj.CDPValueType.eUINT64:
      return variantValue.ui64Value;
    case obj.CDPValueType.eINT64:
      return variantValue.i64Value;
    case obj.CDPValueType.eUINT:
      return variantValue.uiValue;
    case obj.CDPValueType.eINT:
      return variantValue.iValue;
    case obj.CDPValueType.eUSHORT:
      return variantValue.usValue;
    case obj.CDPValueType.eSHORT:
      return variantValue.sValue;
    case obj.CDPValueType.eUCHAR:
      return variantValue.ucValue;
    case obj.CDPValueType.eCHAR:
      return variantValue.cValue;
    case obj.CDPValueType.eBOOL:
      return variantValue.bValue;
    case obj.CDPValueType.eSTRING:
      return variantValue.strValue;
    default:
      return 0;
  }
  };

  obj.appendBuffer = function ( array1, array2 ) {
    var tmp = new Uint8Array( array1.byteLength + array2.byteLength );
    tmp.set( new Uint8Array( array1 ), 0 );
    tmp.set( new Uint8Array( array2 ), array1.byteLength );
    return tmp.buffer;
  }

  obj.CreateAuthRequest = function (dict, challenge) {
    return new Promise(function(resolve, reject) {
      var authReq = obj.AuthRequest.create();
      var username = dict.Username || '';
      var password = dict.Password || '';
      var credentials = new TextEncoder().encode(username.toLowerCase() + ':' + password); // encode to utf-8 byte array
      authReq.userId = username.toLowerCase();
      crypto.subtle.digest('SHA-256', credentials.buffer)
        .then(function(digest) {
          var colon = new Uint8Array([':'.charCodeAt(0)]);
          var buffer = obj.appendBuffer(obj.appendBuffer(challenge, colon), digest);
          return crypto.subtle.digest('SHA-256', buffer)
        })
        .then(function(challenge_digest) {
          var response = obj.AuthRequestChallengeResponse.create();
          response.type = "PasswordHash";
          response.response = new Uint8Array(challenge_digest);
          authReq.challengeResponse = [];
          authReq.challengeResponse.push(response);
          resolve(authReq);
        })
        .catch(function(err){
          reject(err)
        });
    });
  }

  function ErrorHandler(){
    this.name = "Error";
    this.handle = function(message){
      return new Promise(function(resolve, reject) {
        console.log("ProtocolError: "+message+"\n");
        resolve(this);
      }.bind(this));
    }.bind(this);
  }

  function ContainerHandler(onContainer, onError, metadata){
    this.name = "Container";
    this.metadata = metadata;
    this.handle = function(message){
      return new Promise(function(resolve, reject) {

        try {
          var container = obj.Container.decode(new Uint8Array(message));
        } catch (err) {
          console.log("Container Error: "+err+"\n");
          onError();
          resolve(new ErrorHandler());
        }
        onContainer(container, metadata);
        resolve(this);
      }.bind(this));
    }.bind(this);
  }

  function AuthHandler(socket, metadata, credentialsRequested, onContainer, onError){
    this.name = "AuthResponse";
    this.metadata = metadata;

    this.sendAuthRequest = function(userAuthResult){
      var request = new studio.api.Request(this.metadata.systemName, this.metadata.applicationName, this.metadata.cdpVersion, metadata.systemUseNotification, userAuthResult);

      credentialsRequested(request)
        .then(function(dict){
          return obj.CreateAuthRequest(dict, metadata.challenge);
        })
        .then(function(request){
          socket.send(obj.AuthRequest.encode(request).finish());
        })
        .catch(function(err){
          console.log("Authentication cancelled.", err)
        });
    }.bind(this);

    this.handle = function(message){
      return new Promise(function(resolve, reject) {

        try {
          var authResponse = obj.AuthResponse.decode(new Uint8Array(message));
        } catch (err) {
          console.log("AuthResponse Error: "+err+"\n");
          onError();
          resolve(new ErrorHandler());
        }

        if (authResponse.resultCode == obj.AuthResultCode.eGranted)
        {
          var container = obj.Container.create();
          container.messageType = obj.ContainerType.eStructureRequest;
          socket.send(obj.Container.encode(container).finish());
          resolve(new ContainerHandler(onContainer, onError, metadata));
        } else {
          console.log("Unable to login with existing user, password.", authResponse.resultText);
          var userAuthResult = new studio.api.UserAuthResult(authResponse.resultCode, authResponse.resultText);
          this.sendAuthRequest(userAuthResult);
          resolve(this);
        }
      }.bind(this));
    }.bind(this);
  }

  function HelloHandler(socket, notificationListener, onContainer, onError){
    this.name = "Hello";

    this.handle = function(message){
      return new Promise(function(resolve, reject) {
        try {
          var hello = obj.Hello.decode(new Uint8Array(message));
        } catch (err) {
          console.log("Hello Error: "+err+"\n");
          onError();
          resolve(new ErrorHandler());
        }

        function applicationAcceptanceRequested(request){
          return new Promise(function(resolve, reject) {
            if (request.systemUseNotification())
              window.confirm(metadata.systemUseNotification) ? resolve() : reject();
            else
              resolve();
          });
        }

        var metadata = {}
        metadata.systemName = hello.systemName;
        metadata.applicationName = hello.applicationName;
        metadata.cdpVersion = hello.cdpVersionMajor + '.' + hello.cdpVersionMinor + '.' + hello.cdpVersionPatch;
        metadata.systemUseNotification = hello.systemUseNotification;
        metadata.challenge = hello.challenge;

        var request = new studio.api.Request(metadata.systemName, metadata.applicationName, metadata.cdpVersion, metadata.systemUseNotification, null);
        var applicationAccepted = {}

        if (notificationListener && notificationListener.applicationAcceptanceRequested)
          applicationAccepted = notificationListener.applicationAcceptanceRequested;
        else
          applicationAccepted = applicationAcceptanceRequested;

        applicationAccepted(request)
          .then(function(){
            if (hello.challenge && hello.challenge.length) {
              if (!notificationListener || !notificationListener.credentialsRequested)
              {
                console.log("No notificationListener.credentialsRequested callback provided to studio.api.Client constructor. Can't authenticate connection!");
                resolve(new ErrorHandler());
                return;
              }

              var authHandler = new AuthHandler(socket, metadata, notificationListener.credentialsRequested, onContainer, onError);
              var userAuthResult = new studio.api.UserAuthResult(obj.AuthResultCode.eCredentialsRequired, 'Credentials required');
              authHandler.sendAuthRequest(userAuthResult);
              resolve(authHandler);
            }
            else {
              var container = obj.Container.create();
              container.messageType = obj.ContainerType.eStructureRequest;
              socket.send(obj.Container.encode(container).finish());
              resolve(new ContainerHandler(onContainer, onError, metadata));
            }
          })
          .catch(function(){
            console.log("Application acceptance denied.")
            resolve(this);
          });
      }.bind(this));
    };
  }

  obj.Handler = function(socket, notificationListener) {
    this.onContainer = undefined;
    this.onError = undefined;
    var onContainer = function(container, metadata) {(this.onContainer && this.onContainer(container, metadata));}.bind(this);
    var onError = function(){(this.onError && this.onError());}.bind(this);
    var handler = new HelloHandler(socket, notificationListener, onContainer, onError);

    this.handle = function(message){
      handler.handle(message).then(function(newHandler){
        handler = newHandler;
      });
    };
  };

  return obj;
})(protobuf);

studio.protocol.SYSTEM_NODE_ID = 0;
studio.protocol.WS_PREFIX = "ws://";
studio.protocol.WSS_PREFIX = "wss://";
studio.protocol.BINARY_TYPE = "arraybuffer";


/**
 * The studio.internal namespace.
 * @exports studio.internal
 * @namespace
 */
studio.internal = (function(proto) {
  var obj = {};

  obj.structure  = {
    REMOVE: 0,
    ADD: 1
  };

  function AppNode(appConnection, nodeId) {
    var parent = undefined;
    var id = nodeId;
    var app = appConnection;
    var structureFetched = false;
    var childMap = new Map();
    var givenPromises = new Map();
    var childIterators = [];
    var valueSubscriptions = [];
    var structureSubscriptions = [];
    var eventSubscriptions = [];
    var lastValue;
    var lastInfo = null; //when we get this, if there are any child requests we need to fetch child fetch too
    var valid = true;

    this.path = function() {
      var path = "";
      if (parent && parent.id())
        path = parent.path();

      if (path.length)
        path = path + "." + lastInfo.name;
      else
        path = lastInfo.name;

      return path;
    };

    this.id = function() {
      return id;
    };

    this.name = function() {
      return lastInfo.name;
    };

    this.isStructureFetched = function() {
      return structureFetched;
    };

    this.isValid = function() {
      return valid;
    };

    this.invalidate = function() {
      valid = false;
    };

    this.hasSubscriptions = function() {
      return valueSubscriptions.length > 0;
    };

    this.info = function() {
      return lastInfo;
    };

    this.lastValue = function() {
      return lastValue;
    };

    this.forEachChild = function(iteratorFunction) {
      if (structureFetched) {
        childMap.forEach(iteratorFunction);
      } else {
        childIterators.push(iteratorFunction);
        app.makeStructureRequest(id);
      }
    };

    this.update = function(nodeParent, protoInfo) {
      parent = nodeParent;
      lastInfo = protoInfo;
      id = protoInfo.nodeId;
      this.async._makeGetterRequest();
      for (var i = 0; i < eventSubscriptions.length; i++)
        app.makeEventRequest(id, eventSubscriptions[i][1], false);
    };

    this.add = function(node) {
      childMap.set(node.name(), node);
      for (var i = 0; i < structureSubscriptions.length; i++) {
        structureSubscriptions[i](node.name(), obj.structure.ADD);
      }
    };

    this.remove = function(node) {
      for (var i = 0; i < structureSubscriptions.length; i++) {
        structureSubscriptions[i](node.name(), obj.structure.REMOVE);
      }
      node.invalidate();
      childMap.delete(node.name());
    };

    this.child = function(name) {
      return childMap.get(name);
    };

    this.done = function() {
      structureFetched = true;
      //Call process node requests from childRequests
      givenPromises.forEach(function (promiseHandler, apiNode) {
        if (apiNode.isValid()) {
          promiseHandler.resolve(apiNode);
        } else {
          promiseHandler.reject(apiNode);
        }
      });
      givenPromises.clear();

      for (var i = 0; i < childIterators.length; i++) {
        childMap.forEach(childIterators[i]);
        childIterators.splice(i, 1);
      }
    };

    this.receiveValue = function (nodeValue, nodeTimestamp) {
      lastValue = nodeValue;
      for (var i = 0; i < valueSubscriptions.length; i++) {
        valueSubscriptions[i][0](nodeValue, nodeTimestamp);
      }
    };

    this.receiveEvent = function (event) {
      for (var i = 0; i < eventSubscriptions.length; i++) {
        eventSubscriptions[i][0](event);
      }
    };

    this.async = {};

    this.async.onDone = function(resolve, reject, apiNode) {
      if (!structureFetched) {
        givenPromises.set(apiNode, {resolve: resolve, reject: reject});
      } else {
        if (apiNode.isValid()) {
          resolve(apiNode);
        } else {
          reject(apiNode);
        }
      }
    };

    this.async.subscribeToStructure = function(structureConsumer) {
      structureSubscriptions.push(structureConsumer);
    };

    this.async.unsubscribeFromStructure = function(structureConsumer) {
      for (var i = 0; i < structureSubscriptions.length; i++) {
        if (structureConsumer == structureSubscriptions[i]) {
          structureSubscriptions.splice(i, 1);
          break;
        }
      }
    };

    this.async.fetch = function() {
      structureFetched = false;
      app.makeStructureRequest(id);
    };

    this.async.subscribeToValues = function(valueConsumer, fs, sampleRate) {
      valueSubscriptions.push([valueConsumer, fs, sampleRate]);
      this._makeGetterRequest();
    };

    this.async.unsubscribeFromValues = function(valueConsumer) {
      for (var i = 0; i < valueSubscriptions.length; i++) {
        if (valueConsumer == valueSubscriptions[i][0]) {
          valueSubscriptions.splice(i, 1);
          break;
        }
      }
      this._makeGetterRequest();
    };

    this.async.subscribeToEvents = function(eventConsumer, startingFrom) {
      eventSubscriptions.push([eventConsumer, startingFrom]);
      app.makeEventRequest(id, startingFrom, false);
    };

    this.async.unsubscribeFromEvents = function(eventConsumer) {
      for (var i = 0; i < eventSubscriptions.length; i++) {
        if (eventConsumer == eventSubscriptions[i][0]) {
          eventSubscriptions.splice(i, 1);
          break;
        }
      }
      if (eventSubscriptions.length === 0)
        app.makeEventRequest(id, 0, true);
    };

    this.async.addChild = function(name, modelName) {
      app.makeChildAddRequest(id, name, modelName);
    };

    this.async.removeChild = function(name) {
      app.makeChildRemoveRequest(id, name);
    };

    this.async.sendValue = function(value, timestamp) {
      lastValue = value;
      app.makeSetterRequest(id, lastInfo.valueType, value, timestamp);
      //when offline must queue or update pending set request and call set callbacks ...???
    };

    this.async._makeGetterRequest = function() {
      if (valueSubscriptions.length > 0) {
        var maxFs = Math.max.apply(Math, valueSubscriptions.map(v => v[1]));
        var maxSampleRate = Math.max.apply(Math, valueSubscriptions.map(v => v[2]));
        //by studio api protocol 0 is the highest sample rate (all samples), so override maxSampleRate if 0 is found
        const zeroRate = valueSubscriptions.find(e => e[2] === 0);
        maxSampleRate = zeroRate ? zeroRate[2] : maxSampleRate;
        app.makeGetterRequest(id, maxFs, maxSampleRate, false);
      } else {
        app.makeGetterRequest(id, 1, 0, true);
      }
    }
  }

  obj.SystemNode = function(studioURL, notificationListener) {
    var appConnections = [];
    var pendingConnects = [];
    var connected = false;
    var connecting = false;
    var this_ = this;

    this.onAppConnect = function(url, notificationListener, autoConnect) {
      return new Promise(function (resolve, reject) {
        var appConnection = new obj.AppConnection(url, notificationListener, autoConnect);
        appConnections.push(appConnection);
        var sys = appConnection.root();
        sys.async.onDone(resolve, reject, sys);
      });
    };

    this.onConnect = function(resolve, reject, autoConnect) {
      if (connected) {
        resolve(this_);
        return;
      }

      if (connecting) {
        pendingConnects.push({resolve: resolve, reject: reject});
        return;
      }

      connecting = true;
      pendingConnects.push({resolve: resolve, reject: reject});

      this.onAppConnect(studioURL, notificationListener, autoConnect).then(function(system){
        var promises = [];
        system.forEachChild(function (app) {
          if (!app.info().isLocal)
          {
            var appUrl = app.info().serverAddr + ":" + app.info().serverPort;
            promises.push(this_.onAppConnect(appUrl, notificationListener, autoConnect));
          }
        });
        Promise.all(promises).then(function() {
          pendingConnects.forEach(function(con) {
            con.resolve(this_);
          });
          pendingConnects = [];
          connecting = false;
          connected = true;
        });
      }, reject);
    }

    this.applicationNodes = function() {
      var nodes = [];
      appConnections.forEach(function(con) {
        con.root().forEachChild(function(app) {
          if (app.info().isLocal)
            nodes.push(app);
        });
      });
      return nodes;
    }

    this.isValid = function() {
      return true;
    }

    this.name = function() {
      return appConnections[0].root().name();
    };

    this.info = function() {
      return appConnections[0].root().info();
    };

    this.lastValue = function() {
      return appConnections[0].root().lastValue();
    };

    this.child = function(name) {
      return this.applicationNodes().find(function (app) {
        return app.name() === name;
      });
    }

    this.isStructureFetched = function() {
      return true;
    }

    this.forEachChild = function(iteratorFunction) {
      this.applicationNodes().forEach(function (app) {
        iteratorFunction(app);
      });
    };

    this.async = {};

    this.async.fetch = function() {
      this.applicationNodes().forEach(function (app) {
        pendingFetches.push(app);
        app.fetch();
      });
    };

    this.async.onDone = function(resolve, reject, apiNode) {
      const index = pendingFetches.indexOf(apiNode);
      if (index > -1) {
        pendingFetches[index].onDone(resolve, reject, apiNode);
        pendingFetches.splice(index, 1);
      }
    };

    this.async.subscribeToValues = function(valueConsumer, fs=5, sampleRate=0) {

    };

    this.async.subscribeToChildValues = function(name, valueConsumer, fs=5, sampleRate=0) {

    };

    this.async.unsubscribeFromValues = function(valueConsumer) {

    };

    this.async.unsubscribeFromChildValues = function(name, valueConsumer) {

    };

    this.async.subscribeToStructure = function(structureConsumer) {
      this.applicationNodes().forEach(function (app) {
        app.subscribeToStructure(structureConsumer);
      });
    };

    this.async.unsubscribeFromStructure = function(structureConsumer) {
      this.applicationNodes().forEach(function (app) {
        app.unsubscribeFromStructure(structureConsumer);
      });
    };

    this.async.subscribeToEvents = function(eventConsumer, startingFrom) {
      this.applicationNodes().forEach(function (app) {
        app.subscribeToEvents(eventConsumer, startingFrom);
      });
    };

    this.async.unsubscribeFromEvents = function(eventConsumer) {
      this.applicationNodes().forEach(function (app) {
        app.unsubscribeFromEvents(eventConsumer);
      });
    };

    this.async.addChild = function(name, modelName) {

    };

    this.async.removeChild = function(name) {

    };

    this.async.setValue = function(value, timestamp) {

    };
  };

  obj.AppConnection = function(url, notificationListener, autoConnect) {
    var appConnection = this;
    var appName = "";
    var appId = undefined;
    var appUrl = composeUrl(url);
    var socket = new WebSocket(appUrl);
    var handler = new proto.Handler(socket, notificationListener);
    var requests = [];
    var nodeMap = new Map();
    var systemNode = new AppNode(appConnection, proto.SYSTEM_NODE_ID);
    var onClosed;
    var onMessage;
    var onError;
    var onOpen;
    var reauthRequestPending = false;
    socket.binaryType = proto.BINARY_TYPE;
    nodeMap.set(systemNode.id(), systemNode);
    handler.onContainer = handleIncomingContainer;
    this.resubscribe = function(item) {
          if (item.isStructureFetched()) { //we need to refetch this
            item.async.fetch();
            item.async.onDone(function(node){
              node.forEachChild(function(child){
                if (child.isStructureFetched()) {
                  appConnection.resubscribe(child);
                }
              })
            }, function(){ }, item);
          }
    };

    this.root = function() {
      return nodeMap.get(proto.SYSTEM_NODE_ID);
    };

    onMessage = function(evt) { handler.handle(evt.data); };
    onError = function (ev) { console.log("Socket error: " + ev.data); };
    onOpen = function() { appConnection.resubscribe(systemNode); };
    onClosed = function (event) {
      var reason;

      if (event.code == 1000)
        reason = "Normal closure, meaning that the purpose for which the connection was established has been fulfilled.";
      else if (event.code == 1001)
        reason = "An endpoint is \"going away\", such as a server going down or a browser having navigated away from a page.";
      else if (event.code == 1002)
        reason = "An endpoint is terminating the connection due to a protocol error";
      else if (event.code == 1003)
        reason = "An endpoint is terminating the connection because it has received a type of data it cannot accept (e.g., an endpoint that understands only text data MAY send this if it receives a binary message).";
      else if (event.code == 1004)
        reason = "Reserved. The specific meaning might be defined in the future.";
      else if (event.code == 1005)
        reason = "No status code was actually present.";
      else if (event.code == 1006)
        reason = "The connection was closed abnormally, e.g., without sending or receiving a Close control frame";
      else if (event.code == 1007)
        reason = "An endpoint is terminating the connection because it has received data within a message that was not consistent with the type of the message (e.g., non-UTF-8 [http://tools.ietf.org/html/rfc3629] data within a text message).";
      else if (event.code == 1008)
        reason = "An endpoint is terminating the connection because it has received a message that \"violates its policy\". This reason is given either if there is no other suitable reason, or if there is a need to hide specific details about the policy.";
      else if (event.code == 1009)
        reason = "An endpoint is terminating the connection because it has received a message that is too big for it to process.";
      else if (event.code == 1010) // Note that this status code is not used by the server, because it can fail the WebSocket handshake instead.
        reason = "An endpoint (client) is terminating the connection because it has expected the server to negotiate one or more extension, but the server didn't return them in the response message of the WebSocket handshake. Specifically, the extensions that are needed are: " + event.reason;
      else if (event.code == 1011)
        reason = "A server is terminating the connection because it encountered an unexpected condition that prevented it from fulfilling the request.";
      else if (event.code == 1015)
        reason = "The connection was closed due to a failure to perform a TLS handshake (e.g., the server certificate can't be verified).";
      else
        reason = "Unknown reason";

      console.log("Socket close: " + reason);

      if (autoConnect)
      {
        setTimeout(function () {
          console.log("Trying to reconnect", appUrl);
          socket = new WebSocket(appUrl);
          handler = new proto.Handler(socket, notificationListener);
          handler.onContainer = handleIncomingContainer;
          socket.binaryType = proto.BINARY_TYPE;
          socket.onopen = onOpen;
          socket.onclose = onClosed;
          socket.onmessage = onMessage;
          socket.onerror = onError;
        }, 3000);
      }
    };

    socket.onopen = onOpen;
    socket.onclose = onClosed;
    socket.onmessage = onMessage;
    socket.onerror = onError;

    function composeUrl(url) {
      var result = (location.protocol=="https:" ? proto.WSS_PREFIX : proto.WS_PREFIX) + url; //default
      if (URL.canParse(url)) {
        var u = new URL(url);
        if (u.protocol && u.host) {
          if (u.protocol=="https:")
            result = proto.WSS_PREFIX + u.host;
          else if (u.protocol=="http:")
            result = proto.WS_PREFIX + u.host;
          else
           result = u.origin;
        }
      }
      return result;
    }

    function send(message) {
      if (socket.readyState == WebSocket.OPEN) {
        socket.send(message);
      } else {
        requests.push(message);
      }
    }

    function flushRequests() {
      for (var i = 0; i < requests.length; i++) {
        socket.send(requests[i]);
      }
      requests = [];
    }

    this.makeStructureRequest = function(id) {
      var msg = proto.Container.create();
      msg.messageType = proto.ContainerType.eStructureRequest;
      if (id != proto.SYSTEM_NODE_ID) {
        msg.structureRequest = [id];
      }
      send(proto.Container.encode(msg).finish());
    };

    this.makeGetterRequest = function(id, fs, sampleRate, stop) {
      var msg = proto.Container.create();
      var request = proto.ValueRequest.create();
      request.nodeId = id;
      request.fs = fs;
      if (sampleRate) {
        request.sampleRate = sampleRate;
      }
      if (stop) {
        request.stop = stop;
      }
      msg.messageType = proto.ContainerType.eGetterRequest;
      msg.getterRequest = [request];
      send(proto.Container.encode(msg).finish());
    };

    this.makeEventRequest = function(id, startingFrom, stop) {
      var msg = proto.Container.create();
      var request = proto.EventRequest.create();
      request.nodeId = id;
      if (stop) {
        request.stop = stop;
      }
      if (startingFrom != undefined) {
        request.startingFrom = startingFrom;
      }
      msg.messageType = proto.ContainerType.eEventRequest;
      msg.eventRequest = [request];
      send(proto.Container.encode(msg).finish());
    };

    this.makeChildAddRequest = function(id, name, modelName){
      var msg = proto.Container.create();
      var request = proto.ChildAdd.create();
      request.parentNodeId = id;
      request.childName = name;
      request.childTypeName = modelName;
      msg.messageType = proto.ContainerType.eChildAddRequest;
      msg.childAddRequest = [request];
      send(proto.Container.encode(msg).finish());
    }

    this.makeChildRemoveRequest = function(id, name){
      var msg = proto.Container.create();
      var request = proto.ChildRemove.create();
      request.parentNodeId = id;
      request.childName = name;
      msg.messageType = proto.ContainerType.eChildRemoveRequest;
      msg.childRemoveRequest = [request];
      send(proto.Container.encode(msg).finish());
    }

    this.makeSetterRequest = function(id, type, value, timestamp) {
      var msg = proto.Container.create();
      var request = proto.VariantValue.create();
      request.nodeId = id;
      if (timestamp) {
        request.timestamp = timestamp;
      }
      proto.valueToVariant(request, type, value);
      msg.messageType = proto.ContainerType.eSetterRequest;
      msg.setterRequest = [request];
      send(proto.Container.encode(msg).finish());
    };

    function makeReauthRequest(dict, challenge) {
      proto.CreateAuthRequest(dict, challenge)
        .then(function(request){
          var msg = proto.Container.create();
          msg.messageType = proto.ContainerType.eReauthRequest;
          msg.reAuthRequest = request;
          send(proto.Container.encode(msg).finish());
          reauthRequestPending = true;
        })
    };

    function addChildNode(parentNode, protoNode) {
      var newNode = new AppNode(appConnection, protoNode.info.nodeId);
      newNode.update(parentNode, protoNode.info);
      nodeMap.set(protoNode.info.nodeId, newNode);
      parentNode.add(newNode);
    }

    function parseChildNode(parentNode, protoNode) {
      var node = parentNode.child(protoNode.info.name);
      if (node) {
        if (node.id() != protoNode.info.nodeId) {
          //node id has changed after reconnect
          nodeMap.delete(node.id());
          nodeMap.set(protoNode.info.nodeId, node);
        }
        node.update(parentNode, protoNode.info);
      } else {
        addChildNode(parentNode, protoNode);
      }
    }

    function removeMissingChildNodesByNames(parentNode, names) {
      parentNode.forEachChild(function (childNode, name) {
        if (names.indexOf(name) === -1) {
          parentNode.remove(childNode);
          nodeMap.delete(childNode.id());
        }
      });
    }

    function parseNodes(parentNode, protoNode) {
      var names = [];
      for (var n = 0; n < protoNode.node.length; n++) {
        names.push(protoNode.node[n].info.name);
        if (parentNode)
          parseChildNode(parentNode, protoNode.node[n]);
      }
      if (parentNode)
        removeMissingChildNodesByNames(parentNode, names);
    }

    function parseSystemNode(node, protoNode){
      node.update(systemNode,protoNode.info);
      parseNodes(node, protoNode);
      systemNode.forEachChild(function(childNode) {
        if (childNode.info().isLocal) {
          appName = childNode.name();
          appId = childNode.id();
        }
      });
    }

    function parseStructureResponse(protoResponse) {
      for (var i = 0; i < protoResponse.length; i++) {
        var protoNode = protoResponse[i];
        var node = nodeMap.get(protoNode.info.nodeId);
        if (protoNode.info.nodeId != proto.SYSTEM_NODE_ID) {
          parseNodes(node, protoNode);
        } else {
          parseSystemNode(node, protoNode);
        }
        node.done();
      }
    }

    function parseGetterResponse(protoResponse) {
      for (var i = 0; i < protoResponse.length; i++) {
        var variantValue = protoResponse[i];
        var node = nodeMap.get(variantValue.nodeId);
        if (node)
          node.receiveValue(proto.valueFromVariant(variantValue, node.info().valueType), variantValue.timestamp);
      }
    }

    function parseStructureChangeResponse(protoResponse) {
      for (var i = 0; i < protoResponse.length; i++) {
        var invalidatedId = protoResponse[i];
        var node = nodeMap.get(invalidatedId);
        if (node)
          node.async.fetch();
      }
    }

    function parseEventResponse(protoResponse) {
      for (var i = 0; i < protoResponse.length; i++) {
        var variantValue = protoResponse[i];
        for (var j = 0; j < variantValue.nodeId.length; j++) {
          var node = nodeMap.get(variantValue.nodeId[j]);
          if (node){
            var event = {
              id: variantValue.id,
              sender: variantValue.sender,
              code: variantValue.code,
              status: variantValue.status,
              timestamp: variantValue.timestamp,
              data: variantValue.data
            };
            node.receiveEvent(event);
          }
        }
      }
    }

    function reauthenticate(userAuthResult, metadata) {
      var request = new studio.api.Request(metadata.systemName, metadata.applicationName, metadata.cdpVersion, metadata.systemUseNotification, userAuthResult);
      notificationListener.credentialsRequested(request)
        .then(function(dict){
          makeReauthRequest(dict, metadata.challenge);
        })
        .catch(function(err){
          console.log("Authentication failed.", err)
        });
    }

    function parseReauthResponse(protoResponse, metadata) {
      reauthRequestPending = false;
      if (protoResponse.resultCode != proto.AuthResultCode.eGranted && protoResponse.resultCode != proto.AuthResultCode.eGrantedPasswordWillExpireSoon) {
        var userAuthResult = new studio.api.UserAuthResult(protoResponse.resultCode, protoResponse.resultText, protoResponse.additionalChallengeResponseRequired);
        reauthenticate(userAuthResult, metadata);
      }
    }

    function parseErrorResponse(protoResponse, metadata) {
      if (!reauthRequestPending && protoResponse.code == proto.RemoteErrorCode.eAUTH_RESPONSE_EXPIRED) {
        var userAuthResult = new studio.api.UserAuthResult(proto.AuthResultCode.eReauthenticationRequired, protoResponse.text, null);
        metadata.challenge = protoResponse.challenge;
        reauthenticate(userAuthResult, metadata);
     }
      else
        console.log("Received error response with code " + protoResponse.code
          + ' and text: "' + protoResponse.text + '"');
    }

    function handleIncomingContainer(protoContainer, metadata) {
      switch(protoContainer.messageType){
        case proto.ContainerType.eStructureResponse:
          parseStructureResponse(protoContainer.structureResponse);
          break;
        case proto.ContainerType.eGetterResponse:
          parseGetterResponse(protoContainer.getterResponse);
          break;
        case proto.ContainerType.eStructureChangeResponse:
          parseStructureChangeResponse(protoContainer.structureChangeResponse);
          break;
        case proto.ContainerType.eEventResponse:
          parseEventResponse(protoContainer.eventResponse);
          break;
        case proto.ContainerType.eCurrentTimeResponse:
          break;
        case proto.ContainerType.eReauthResponse:
          parseReauthResponse(protoContainer.reAuthResponse, metadata);
          break;
        case proto.ContainerType.eRemoteError:
          parseErrorResponse(protoContainer.error, metadata);
        default:
          //TODO: Indicate error to Client
      }
      flushRequests();
    }
  };

  return obj;
})(studio.protocol);

/**
 * The studio.api namespace.
 * @exports studio.api
 * @namespace
 * @expose
 */
studio.api = (function(internal) {
  var obj = {};

  /**
   * Creates an instance of INode
   *
   * @param {AppNode} appNode
   * @this INode
   * @constructor
   */
  function INode(appNode) {
    var node = appNode;
    var instance = this;

    /**
     * Get nodes valid state
     *
     * @returns {bool} node state becomes not valid after node is removed or it is not in the tree anymore.
     */
    this.isValid = function() {
      return node.isValid();
    };

    /**
     * Get nodes name.
     *
     * @returns {string} A node name.
     */
    this.name = function() {
      return node.name();
    };

    this.info = function() {
      return node.info();
    };
    /**
     * Access the last known value.
     *
     * @returns {number} A value last sent or received on the node.
     */
    this.lastValue = function() {
      return node.lastValue();
    };

    /**
     * Iteration callback used by forEachChild.
     *
     * @callback iteratorCallback
     * @param {INode} childNode
     */

    /**
     * Iterate over children of current node.
     *
     * Iteration starts when structure for the node is received.
     * @param {iteratorCallback} iteratorCallback
     */
    this.forEachChild = function(iteratorCallback) {
      appNode.forEachChild(function(internalNode) {
        iteratorCallback(new INode(internalNode));
      });
    };

    /**
     * Request named child node of this node.
     *
     * @param name
     * @returns {Promise.<INode>} A promise containing named child node when fulfilled.
     */
    this.child = function(name) {
      if (node.isValid()) {
        return new Promise(function (resolve, reject) {
          if (node.isStructureFetched()) {
            var childNode = node.child(name);
            if (childNode) {
              var iNode = new INode(childNode);
              if (!childNode.isStructureFetched()) {
                childNode.async.fetch();
                childNode.async.onDone(resolve, reject, iNode);
              } else {
                resolve(iNode);
              }
            } else {
              reject("Child named '" + name + "' not found");
            }
          } else {
            node.async.fetch();
            node.async.onDone(function () {
              var childNode = node.child(name);
              if (childNode) {
                var iNode = new INode(childNode);
                if (!childNode.isStructureFetched()) {
                  childNode.async.fetch();
                  childNode.async.onDone(resolve, reject, iNode);
                } else {
                  resolve(iNode);
                }
              } else {
                reject("Child named '" + name + "' not found");
              }
            }, reject, new INode(node))
          }
        });
      } else {
        return new Promise(function (resolve, reject) {
          reject("Child named '" + name + "' not found. Parent node is invalid");
        });
      }
    };

    /**
     * Value callback used by subscribe.
     *
     * @callback valueConsumer
     * @param {number} value
     * @param {number} timestamp
     */

    /**
     * Subscribe to value changes on this node.
     *
     * @param {valueConsumer} valueConsumer
     * @param {fs} Maximum frequency that value updates are expected (controls how many changes are sent in a single packet). Defaults to 5 hz.
     * @param {sampleRate} Maximum amount of value updates sent per second (controls the amount of data transferred). Zero means all samples must be provided. Defaults to 0.
     */
    this.subscribeToValues = function(valueConsumer, fs=5, sampleRate=0) {
      node.async.subscribeToValues(valueConsumer, fs, sampleRate);
    };

    /**
     * Subscribe to node child value changes on this node.
     *
     * @param {string} name
     * @param {valueConsumer} valueConsumer
     * @param {fs} Maximum frequency that value updates are expected (controls how many changes are sent in a single packet). Defaults to 5 hz.
     * @param {sampleRate} Maximum amount of value updates sent per second (controls the amount of data transferred). Zero means all samples must be provided. Defaults to 0.
     */
    this.subscribeToChildValues = function(name, valueConsumer, fs=5, sampleRate=0) {
      instance.child(name).then(function (child) {
        child.subscribeToValues(valueConsumer, fs, sampleRate);
      }, function (){ console.log("subscribeToChildValues() Child not found "+ name) });
    };

    /**
     * Unsubscribe given callback from value changes on this node.
     *
     * @param {valueConsumer}
     */
    this.unsubscribeFromValues = function(valueConsumer) {
      node.async.unsubscribeFromValues(valueConsumer);
    };

    /**
     * Unsubscribe given callback from child value changes on this node.
     *
     * @param {string} name
     * @param {valueConsumer}
     */
    this.unsubscribeFromChildValues = function(name, valueConsumer) {
      instance.child(name).then(function (child) {
        child.unsubscribeFromValues(valueConsumer);
      }, function (){ console.log("unsubscribeFromChildValues() Child not found "+ name) });
    };

    /**
     * Structure callback used by structure subscribe/unsubscribe.
     *
     * @callback structureConsumer
     * @param {string} node name
     * @param {number} REMOVE 0/ADD 1 from studio.api.structure.ADD / studio.api.structure.REMOVE
     */

    /**
     * Subscribe to structure changes on this node.
     *
     * @param {structureConsumer} structureConsumer
     */
    this.subscribeToStructure = function(structureConsumer) {
      node.async.subscribeToStructure(structureConsumer);
    };

    /**
     * Unsubscribe given callback from structure changes on this node.
     *
     * @param {structureConsumer} structureConsumer
     */
    this.unsubscribeFromStructure = function(structureConsumer) {
      node.async.unsubscribeFromStructure(structureConsumer);
    };


    /**
     * Subscribe to value changes on this node.
     *
     * @param {valueConsumer} valueConsumer
     * @param {fs} Maximum frequency that value updates are expected (controls how many changes are sent in a single packet). Defaults to 5 hz.
     * @param {sampleRate} Maximum amount of value updates sent per second (controls the amount of data transferred). Zero means all samples must be provided. Defaults to 0.
     */
    this.subscribeToValues = function(valueConsumer, fs=5, sampleRate=0) {
      node.async.subscribeToValues(valueConsumer, fs, sampleRate);
    };

    /**
     * Subscribe to events on this node.
     *
     * @param {eventConsumer} eventConsumer
     * @param {startingFrom} If > 0, past events starting from this timestamp (in UTC nanotime) are re-forwarded.
     */
    this.subscribeToEvents = function(eventConsumer, startingFrom) {
      node.async.subscribeToEvents(eventConsumer, startingFrom);
    };

    /**
     * Unsubscribe given callback from events on this node.
     *
     * @param {eventConsumer} eventConsumer
     */
    this.unsubscribeFromEvents = function(eventConsumer) {
      node.async.unsubscribeFromEvents(eventConsumer);
    };

    /**
     * Add child Node to this Node.
     *
     * @param {name} Name for the new node
     * @param {modelName} Model name to be used for adding the new node
     */
    this.addChild = function(name, modelName) {
      node.async.addChild(name, modelName);
    };

    /**
     * Remove child Node from this Node.
     *
     * @param {name} Name of the child to be removed
     */
    this.removeChild = function(name) {
      node.async.removeChild(name);
    };

    /**
     * Set nodes value
     *
     * @param value
     * @param timestamp (NOTE: setting with timestamp not yet supported)
     */
    this.setValue = function(value, timestamp) {
      node.async.sendValue(value, timestamp);
    };
  }

  obj.structure = internal.structure;

  obj.UserAuthResult = function(code, text, additionalCredentials) {
    this.code = function() {
      return code;
    }
    this.text = function() {
      return text;
    }
    this.additionalCredentials = function() {
      return additionalCredentials;
    }
  }

  obj.Request = function(systemName, applicationName, cdpVersion, systemUseNotification, userAuthResult) {
    this.systemName = function() {
      return systemName;
    }
    this.applicationName = function() {
      return applicationName;
    }
    this.cdpVersion = function() {
      return cdpVersion;
    }
    this.systemUseNotification = function() {
      return systemUseNotification;
    }
    this.userAuthResult = function() {
      return userAuthResult;
    }
  }

  /**
   * Creates an instance of Client
   *
   * @param studioURL String containing the address and port of StudioAPI server separated by colon character
   * @param notificationListener Object returning two functions: applicationAcceptanceRequested(AuthRequest) and credentialsRequested(AuthRequest). Function credentialsRequested must return a Promise of dictionary containing 'Username' and 'Password' as keys for authentication.
   *
   * @this Client
   * @constructor
   */
  obj.Client = function(studioURL, notificationListener, autoConnect = true) {
    var system = new internal.SystemNode(studioURL, notificationListener);

    /**
     * Request root node.
     *
     * @returns {Promise.<INode>} A promise containing root node when fulfilled.
     */
    this.root = function(){
      return new Promise(function(resolve, reject) {
        system.onConnect(function(system){
          resolve(new INode(system));
        }, reject, autoConnect);
      });
    };

    /**
     * Request next node on path.
     *
     * @param promise Total from reduce() function
     * @param nodeName The currentValue from reduce() function
     * @param index The index of the nodeName in the array of nodes
     * @param arr The array containing all the node names in the route path
     *
     * @returns {Promise.<INode>} A promise containing the node for the current location on the path
     */
    var findNode = (function() {
      var memoize = {};
      var nodes = {};

      function f(promise, nodeName, index, arr) {
        var path = arr.slice(0,index+1);
        if (memoize[path] && !nodes[path])
          return memoize[path];
        else if (memoize[path] && nodes[path] && nodes[path].isValid())
          return memoize[path];
        else
          return memoize[path] = promise.then(
              function(node) {
                nodes[path] = node;
                return node.child(nodeName);
              },
              function() {
                delete nodes[path];
                delete memoize[path];
                return new Promise(function(resolve, reject) { reject("Child not found: " + path); });
              });
      }
      return f;
    })();
    /**
     * Request node with provided path.
     *
     * @param nodePath Should contain dot separated path to target node. Note: root node is not considered part of the path.
     * @returns {Promise.<INode>} A promise containing requested node when fulfilled.
     */
    this.find = function(nodePath) {
      var nodes = nodePath.split(".");
      return nodes.reduce(findNode, this.root());
    };

  };

  return obj;
})(studio.internal);

/* --------------------------------------------------------------------------
 * Module export (CommonJS/ES Module hybrid)
 * ------------------------------------------------------------------------ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = studio;
} else if (typeof globalThis !== 'undefined') {
  globalThis.studio = studio;
}


