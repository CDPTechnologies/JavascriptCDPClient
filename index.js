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
      protobuf = window.protobuf;
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
  var root = ProtoBuf.parse(globalThis.p).root;

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
  obj.EventStatus = {
    eStatusOK: 0x0,
    eNotifySet: 0x1,
    eWarningSet: 0x10,
    eLowLevelSet: 0x20,
    eHighLevelSet: 0x40,
    eErrorSet: 0x100,
    eLowLowLevelSet: 0x200,
    eHighHighLevelSet: 0x400,
    eEmergencySet: 0x800,
    eValueForced: 0x1000,
    eRepeatBlocked: 0x2000,
    eProcessBlocked: 0x4000,
    eOperatorBlocked: 0x8000,
    eNotifyUnacked: 0x10000,
    eWarningUnacked: 0x100000,
    eErrorUnacked: 0x1000000,
    eEmergencyUnacked: 0x8000000,
    eDisabled: 0x20000000,
    eSignalFault: 0x40000000,
    eComponentSuspended: 0x80000000
  };
  obj.ChildAdd = root.lookupType("ChildAdd");
  obj.ChildRemove = root.lookupType("ChildRemove");
  obj.ServicesRequest = root.lookupType("ServicesRequest");
  obj.ServicesNotification = root.lookupType("ServicesNotification");
  obj.ServiceInfo = root.lookupType("ServiceInfo");
  obj.ServiceMessage = root.lookupType("ServiceMessage");
  obj.ServiceMessageKind = root.lookupEnum("ServiceMessage.Kind").values;

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

  // Minimum compat version required for proxy protocol support
  var PROXY_MIN_COMPAT_VERSION = 4;
  obj.PROXY_MIN_COMPAT_VERSION = PROXY_MIN_COMPAT_VERSION;

  // Create encoded ServicesRequest container bytes for proxy protocol
  obj.createServicesRequestBytes = function() {
    var servicesReq = obj.Container.create();
    servicesReq.messageType = obj.ContainerType.eServicesRequest;
    servicesReq.servicesRequest = obj.ServicesRequest.create({
      subscribe: true,
      inactivityResendInterval: 120
    });
    return obj.Container.encode(servicesReq).finish();
  };

  // Helper to send ServicesRequest for proxy protocol (compat >= 4)
  function sendServicesRequest(socket, metadata) {
    if (metadata.compatVersion >= PROXY_MIN_COMPAT_VERSION) {
      socket.send(obj.createServicesRequestBytes());
    }
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
          return resolve(new ErrorHandler());
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
          return resolve(new ErrorHandler());
        }

        if (authResponse.resultCode == obj.AuthResultCode.eGranted)
        {
          var container = obj.Container.create();
          container.messageType = obj.ContainerType.eStructureRequest;
          socket.send(obj.Container.encode(container).finish());
          sendServicesRequest(socket, metadata);
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
          return resolve(new ErrorHandler());
        }

        function applicationAcceptanceRequested(request){
          return new Promise(function(resolve, reject) {
            if (request.systemUseNotification()) {
              // In browser, use window.confirm; in Node.js, auto-accept
              if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
                window.confirm(metadata.systemUseNotification) ? resolve() : reject();
              } else {
                // Node.js: auto-accept system use notification
                console.log("System use notification: " + metadata.systemUseNotification);
                resolve();
              }
            } else {
              resolve();
            }
          });
        }

        var metadata = {}
        metadata.systemName = hello.systemName;
        metadata.applicationName = hello.applicationName;
        metadata.cdpVersion = hello.cdpVersionMajor + '.' + hello.cdpVersionMinor + '.' + hello.cdpVersionPatch;
        metadata.systemUseNotification = hello.systemUseNotification;
        metadata.challenge = hello.challenge;
        metadata.compatVersion = hello.compatVersion;

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
              sendServicesRequest(socket, metadata);
              resolve(new ContainerHandler(onContainer, onError, metadata));
            }
          })
          .catch(function(err){
            console.error("Application acceptance failed:", err);
            resolve(this);
          }.bind(this));
      }.bind(this));
    };
  }

  obj.Handler = function(socket, notificationListener) {
    this.onContainer = undefined;
    this.onError = undefined;
    var onContainer = function(container, metadata) {(this.onContainer && this.onContainer(container, metadata));}.bind(this);
    var onError = function(){(this.onError && this.onError());}.bind(this);
    var handler = new HelloHandler(socket, notificationListener, onContainer, onError);
    var messageQueue = [];
    var processing = false;

    var processQueue = function() {
      if (processing || messageQueue.length === 0) return;
      processing = true;
      var message = messageQueue.shift();
      handler.handle(message).then(function(newHandler) {
        handler = newHandler;
        processing = false;
        processQueue();
      }).catch(function(err) {
        console.error("Handler error:", err);
        processing = false;
        processQueue();
      });
    };

    this.handle = function(message){
      messageQueue.push(message);
      processQueue();
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
    ADD: 1,
    RECONNECT: 2
  };

  var STRUCTURE_REQUEST_TIMEOUT_MS = 30000;
  var MAX_RECONNECT_DELAY_MS = 30000;
  var INITIAL_RECONNECT_DELAY_MS = 1000;
  var INACTIVITY_RESEND_INTERVAL_S = 120;

  // Helper to remove first matching item from array (shared by AppNode and SystemNode)
  function removeFirst(array, predicate) {
    var idx = array.findIndex(predicate);
    if (idx >= 0) array.splice(idx, 1);
  }

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
    var hasActiveValueSubscription = false; // track if we've sent a getter request to server
    var lastServerTimestamp = null; // for value dedup after reconnect
    var lastEventTimestamp = 0; // track last received event timestamp for reconnect resume
    var recentEventIds = new Map(); // eventId → timestamp for dedup (30s sliding window)

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
      givenPromises.forEach(function(promiseHandlers, apiNode) {
        promiseHandlers.forEach(function(promiseHandler) {
          try {
            clearTimeout(promiseHandler.timer);
            promiseHandler.reject(apiNode);
          } catch (e) { /* ignore */ }
        });
      });
      givenPromises.clear();
    };

    this.hasSubscriptions = function() {
      return valueSubscriptions.length > 0 || eventSubscriptions.length > 0;
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

    // Internal: iterate children immediately without structureFetched check
    // Used during structure parsing to detect removed children
    this.forEachChildImmediate = function(iteratorFunction) {
      childMap.forEach(iteratorFunction);
    };

    this.update = function(nodeParent, protoInfo) {
      parent = nodeParent;
      lastInfo = protoInfo;
      id = protoInfo.nodeId;
      // Keep lastServerTimestamp across reconnect — restarted apps produce newer
      // timestamps, so the server's replayed last-known-value (which has the old
      // timestamp) is correctly filtered by the dedup check in receiveValue().
      // Keep recentEventIds across reconnect — the 30s sliding window handles
      // cleanup, and preserving it prevents the server's inclusive startingFrom
      // replay from delivering the boundary event as a duplicate.
      this.async._makeGetterRequest();
      for (var i = 0; i < eventSubscriptions.length; i++) {
        // Resume from last received event timestamp (not original startingFrom) to avoid duplicates
        var resumeFrom = lastEventTimestamp > 0 ? lastEventTimestamp : eventSubscriptions[i][1];
        app.makeEventRequest(id, resumeFrom, false);
      }
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
      valid = true; // Re-validate node when structure is successfully fetched
      givenPromises.forEach(function (promiseHandlers, apiNode) {
        promiseHandlers.forEach(function(promiseHandler) {
          if (apiNode.isValid()) {
            promiseHandler.resolve(apiNode);
          } else {
            promiseHandler.reject(apiNode);
          }
        });
      });
      givenPromises.clear();

      for (var i = 0; i < childIterators.length; i++) {
        childMap.forEach(childIterators[i]);
      }
      childIterators.length = 0;
    };

    this.receiveValue = function (nodeValue, nodeTimestamp) {
      // Dedup: skip values with strictly older timestamps (happens after reconnect
      // when server replays last known value). Uses strict less-than so that
      // legitimate same-timestamp values are not dropped.
      if (nodeTimestamp !== undefined) {
        var ts = Number(nodeTimestamp);
        if (ts > 0) {
          if (lastServerTimestamp !== null && ts < lastServerTimestamp)
            return;
          lastServerTimestamp = ts;
        }
      }
      lastValue = nodeValue;
      for (var i = 0; i < valueSubscriptions.length; i++) {
        valueSubscriptions[i][0](nodeValue, nodeTimestamp);
      }
    };

    this.receiveEvent = function (event) {
      if (event.timestamp !== undefined) {
        var ts = Number(event.timestamp);
        if (ts > lastEventTimestamp) lastEventTimestamp = ts;
        // Event dedup: skip events already delivered (can happen after reconnect).
        // Use String(event.id) as Map key because protobufjs returns Long objects
        // for uint64 fields, and Long objects use reference equality in Map.
        if (event.id !== undefined) {
          var eventKey = String(event.id);
          if (recentEventIds.has(eventKey) && recentEventIds.get(eventKey) >= ts) {
            return; // duplicate
          }
          recentEventIds.set(eventKey, ts);
          // Trim when map grows large (30s sliding window in nanoseconds)
          if (recentEventIds.size > 200 && ts > 0) {
            var cutoff = ts - 30e9;
            recentEventIds.forEach(function(storedTs, evId) {
              if (storedTs < cutoff) recentEventIds.delete(evId);
            });
          }
        }
      }
      for (var i = 0; i < eventSubscriptions.length; i++) {
        eventSubscriptions[i][0](event);
      }
    };

    this.async = {};

    this.async.onDone = function(resolve, reject, apiNode) {
      if (!structureFetched) {
        // Support multiple callbacks per node (e.g., registerConnection + connectViaProxy)
        if (!givenPromises.has(apiNode)) {
          givenPromises.set(apiNode, []);
        }
        var settled = false;
        var entry = {
          resolve: function(v) { if (!settled) { settled = true; clearTimeout(entry.timer); resolve(v); } },
          reject: function(v) { if (!settled) { settled = true; clearTimeout(entry.timer); reject(v); } },
          timer: setTimeout(function() {
            if (!settled) {
              settled = true;
              // Remove from givenPromises to prevent double-fire
              var arr = givenPromises.get(apiNode);
              var idx = arr.indexOf(entry);
              if (idx >= 0) arr.splice(idx, 1);
              if (arr.length === 0) givenPromises.delete(apiNode);
              reject(new Error("Structure request timed out after " + STRUCTURE_REQUEST_TIMEOUT_MS + "ms"));
            }
          }, STRUCTURE_REQUEST_TIMEOUT_MS)
        };
        givenPromises.get(apiNode).push(entry);
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
      removeFirst(structureSubscriptions, function(s) { return s === structureConsumer; });
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
      removeFirst(valueSubscriptions, function(s) { return s[0] === valueConsumer; });
      this._makeGetterRequest();
    };

    this.async.subscribeToEvents = function(eventConsumer, startingFrom) {
      eventSubscriptions.push([eventConsumer, startingFrom]);
      app.makeEventRequest(id, startingFrom, false);
    };

    this.async.unsubscribeFromEvents = function(eventConsumer) {
      removeFirst(eventSubscriptions, function(s) { return s[0] === eventConsumer; });
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
        hasActiveValueSubscription = true;
      } else if (hasActiveValueSubscription) {
        // Only send stop request if we previously subscribed
        app.makeGetterRequest(id, 1, 0, true);
        hasActiveValueSubscription = false;
      }
    }
  }

	  obj.SystemNode = function(studioURL, notificationListener, onStructureChange) {
	    var appConnections = [];
	    var pendingConnects = [];
	    var connected = false;
	    var connecting = false;
	    var connectGeneration = 0;
	    var isClosed = false;
	    var structureSubscriptions = [];
	    var announcedApps = new Set();
	    var everSeenApps = new Set();
	    var pendingFindWaiters = []; // for find() waiting on late apps
	    var pendingFetches = [];
	    var connectionLocalApps = new Map(); // Maps AppConnection → local app name (direct mode)
	    var this_ = this;

    function isApplicationNode(node) {
      var info = node.info();
      return info && info.isLocal && info.nodeType === proto.CDPNodeType.CDP_APPLICATION;
    }

    function appAddress(info) {
      return info.serverAddr + ':' + info.serverPort;
    }

    function notifyStructure(name, change) {
      // Notify internal cache invalidation callback (constructor param)
      if (onStructureChange) {
        try {
          onStructureChange(name);
        } catch (e) {
          console.error("onStructureChange callback threw:", e);
        }
      }
      // Notify user structure subscriptions
      structureSubscriptions.forEach(function (cb) {
        try {
          cb(name, change);
        } catch (e) {
          console.error("Structure subscription callback threw:", e);
        }
      });
    }

    // Wake up find() callers waiting for a specific app to appear
    function notifyFindWaiters(appName) {
      pendingFindWaiters = pendingFindWaiters.filter(function(waiter) {
        if (waiter.appName === appName) {
          waiter.resolve();
          return false; // remove from list
        }
        return true;
      });
    }

    // Check if an app is currently connected and announced
    this.isAppAvailable = function(appName) {
      return announcedApps.has(appName);
    };

    // Check if an app was ever seen (used to distinguish "not yet discovered" from "disconnected")
    this.wasAppSeen = function(appName) {
      return everSeenApps.has(appName);
    };

    // Check if client is in direct mode (no proxy protocol)
    this.isDirectMode = function() {
      return appConnections.length > 0 && !appConnections[0].supportsProxyProtocol();
    };

    // Request a structure refresh from the primary connection (direct mode only).
    // In proxy mode, discovery is push-based via ServicesNotification so this is a no-op.
    function requestStructureRefresh() {
      if (appConnections[0] && !appConnections[0].supportsProxyProtocol()) {
        appConnections[0].makeStructureRequest(0);
      }
    }

    // Register a waiter for a specific app name, with timeout
    this.waitForApp = function(appName, timeoutMs) {
      // Check if already available
      if (announcedApps.has(appName)) {
        return Promise.resolve();
      }

      // In direct mode, ask the server now to trigger immediate discovery.
      // After this, the server will push eStructureChangeResponse (id 0)
      // when siblings start/stop.
      requestStructureRefresh();

      return new Promise(function(resolve, reject) {
        var waiter = { appName: appName };
        var timer = timeoutMs > 0 ? setTimeout(function() {
          pendingFindWaiters = pendingFindWaiters.filter(function(w) { return w !== waiter; });
          reject(new Error(appName + " not found within " + timeoutMs + "ms"));
        }, timeoutMs) : null;
        waiter.resolve = function() { clearTimeout(timer); resolve(); };
        waiter.reject = function(err) { clearTimeout(timer); reject(err); };
        pendingFindWaiters.push(waiter);
      });
    };

    // Announce an app as ADD (first time) or RECONNECT (seen before).
    // No-op if already announced or not a valid application node.
    function announceApp(appName, node) {
      if (announcedApps.has(appName)) return;
      if (!everSeenApps.has(appName) && (!node || !isApplicationNode(node))) return;
      var change = everSeenApps.has(appName) ? obj.structure.RECONNECT : obj.structure.ADD;
      announcedApps.add(appName);
      everSeenApps.add(appName);
      notifyStructure(appName, change);
      notifyFindWaiters(appName);
    }

    function unannounceApp(appName) {
      if (!announcedApps.has(appName)) return;
      announcedApps.delete(appName);
      notifyStructure(appName, obj.structure.REMOVE);
    }

    function notifyApplications(connection) {
      connection.root().forEachChild(function (node) {
        announceApp(node.name(), node);
      });
    }

    function registerConnection(connection, resolve, reject) {
      var sys = connection.root();
      sys.async.onDone(function (system) {
        notifyApplications(connection);

        var primaryConn = appConnections[0];
        var isProxyMode = primaryConn && primaryConn.supportsProxyProtocol();

        if (isProxyMode) {
          // Proxy mode: only handle REMOVE here. ADD/RECONNECT is deferred to
          // notifyApplications() after the proxy tunnel connects (via
          // tryConnectPendingSiblings → connectViaProxy), ensuring the sibling
          // is actually reachable before announcing it.
          system.async.subscribeToStructure(function(appName, change) {
            if (change === obj.structure.REMOVE) {
              unannounceApp(appName);
            }
          });
        } else {
          // Direct mode: each connection owns its local app.
          // Connection lifecycle directly maps to app lifecycle.
          system.forEachChild(function(app) {
            if (isApplicationNode(app)) {
              connectionLocalApps.set(connection, app.name());
            }
          });
        }

        resolve(system);
      }, reject, sys);
    }

    this.onAppConnect = function(url, notificationListener, autoConnect) {
      return new Promise(function (resolve, reject) {
        var appConnection = new obj.AppConnection(url, notificationListener, autoConnect);
        appConnections.push(appConnection);

        // Direct mode lifecycle: connection close → REMOVE, reconnect → RECONNECT
        appConnection.onDisconnected = function() {
          var localApp = connectionLocalApps.get(appConnection);
          if (localApp) unannounceApp(localApp);
        };
        appConnection.onReconnected = function() {
          if (!connectionLocalApps.has(appConnection)) {
            // Initial registration may have timed out — populate now
            appConnection.root().forEachChild(function(app) {
              if (isApplicationNode(app)) {
                connectionLocalApps.set(appConnection, app.name());
              }
            });
          }
          notifyApplications(appConnection);
        };

        appConnection.onServiceConnectionEstablished = function(serviceConnection, instanceKey) {
          serviceConnection.instanceKey = instanceKey;
          appConnections.push(serviceConnection);
          registerConnection(serviceConnection, function(){}, function(){});
        };
        appConnection.onServiceConnectionRemoved = function(instanceKey, closedByUser) {
          var removed = appConnections.filter(function(con) { return con.instanceKey === instanceKey; });
          removed.forEach(function(con) {
            if (con.siblingKey) {
              connectedSiblings.delete(con.siblingKey);
            }
            con.root().forEachChild(function(node) {
              if (isApplicationNode(node)) {
                unannounceApp(node.name());
              }
            });
            if (closedByUser) {
              con.invalidateAllNodes();
              appConnections = appConnections.filter(function(c) { return c.instanceKey !== instanceKey; });
            }
            // Unintentional disconnect — keep AppConnection alive for reconnection
          });
        };
        registerConnection(appConnection, resolve, reject);
      });
    };

    var knownSiblings = new Set();
    var connectedSiblings = new Set();

    function tryConnectPendingSiblings(primaryConnection) {
      knownSiblings.forEach(function(key) {
        if (connectedSiblings.has(key)) {
          return;
        }
        var parts = key.split(':');
        var addr = parts[0], port = parts[1];
        if (primaryConnection.isProxyAvailable(addr, port)) {
          connectedSiblings.add(key);
          // Check for existing disconnected AppConnection to reconnect
          var existing = appConnections.find(function(con) { return con.siblingKey === key; });
          primaryConnection.connectViaProxy(addr, port, existing).then(function(connection) {
            // Re-announce apps after reconnection (or initial connection via proxy)
            notifyApplications(connection);
          }).catch(function(err) {
            console.error("Failed to connect via proxy to " + key + ":", err);
            connectedSiblings.delete(key);
          });
        }
      });
    }

	    this.onConnect = function(resolve, reject, autoConnect) {
	      if (isClosed) {
	        reject(new Error("Client has been closed"));
	        return;
	      }
	      if (connected) {
	        resolve(this_);
	        return;
	      }

      if (connecting) {
        pendingConnects.push({resolve: resolve, reject: reject});
        return;
      }

	      connecting = true;
	      var generation = ++connectGeneration;
	      pendingConnects.push({resolve: resolve, reject: reject});

	      this.onAppConnect(studioURL, notificationListener, autoConnect).then(function(system){
	        if (generation !== connectGeneration) {
	          return;
	        }
	        var promises = [];
	        var primaryConnection = appConnections[0];

        if (!primaryConnection || !primaryConnection.supportsProxyProtocol()) {
          system.forEachChild(function (app) {
            if (!app.info().isLocal)
            {
              var appUrl = appAddress(app.info());
              promises.push(this_.onAppConnect(appUrl, notificationListener, autoConnect));
            }
          });
          // Watch primary connection's structure for new siblings (direct mode)
          system.async.subscribeToStructure(function(appName, change) {
            if (change === obj.structure.ADD) {
              var app = system.child(appName);
              if (app && app.info() && !app.info().isLocal) {
                // New sibling discovered — check we don't already have a connection
                var alreadyConnected = Array.from(connectionLocalApps.values()).indexOf(appName) >= 0;
                if (!alreadyConnected) {
                  var appUrl = appAddress(app.info());
                  this_.onAppConnect(appUrl, notificationListener, autoConnect).catch(function(err) {
                    console.error("Failed to connect to sibling " + appName + ":", err);
                  });
                }
              }
            }
          });
          // Direct mode discovery: waitForApp() and subscribeToStructure()
          // trigger structure refreshes on demand.
        } else {
          system.forEachChild(function (app) {
            if (!app.info().isLocal) {
              knownSiblings.add(appAddress(app.info()));
            }
          });

          // Separate from registerConnection's structure subscription (which handles
          // user-facing app lifecycle via announceApp/unannounceApp). This one manages
          // proxy connection establishment when new siblings appear.
          system.async.subscribeToStructure(function(appName, change) {
            if (change === obj.structure.ADD) {
              var app = system.child(appName);
              var appInfo = app && app.info();
              if (app && appInfo) {
                if (!appInfo.isLocal) {
                  // Remote sibling - track for proxy connection
                  knownSiblings.add(appAddress(appInfo));
                  tryConnectPendingSiblings(primaryConnection);
                } else {
                  // Local sibling came back - re-fetch and resubscribe through primary connection
                  primaryConnection.resubscribe(app);
                }
              }
            }
          });

          primaryConnection.onServicesUpdated = function() {
            // Repopulate knownSiblings from current structure (handles reconnect case)
            system.forEachChild(function (app) {
              var appInfo = app.info();
              if (appInfo && !appInfo.isLocal) {
                knownSiblings.add(appAddress(appInfo));
              }
            });
            tryConnectPendingSiblings(primaryConnection);
          };

          tryConnectPendingSiblings(primaryConnection);
        }

	        Promise.all(promises).then(function() {
	          if (generation !== connectGeneration) {
	            return;
	          }
	          pendingConnects.forEach(function(con) {
	            con.resolve(this_);
	          });
	          pendingConnects = [];
	          connecting = false;
	          connected = true;
	        }).catch(function(err) {
	          if (generation !== connectGeneration) {
	            return;
	          }
	          console.error("Some sibling connections failed:", err);
	          pendingConnects.forEach(function(con) {
	            con.resolve(this_);
	          });
	          pendingConnects = [];
	          connecting = false;
	          connected = true;
	        });
	      }, function(err) {
	        if (generation !== connectGeneration) {
	          return;
	        }
	        // Reject all pending connect callers, not just the first one
	        pendingConnects.forEach(function(con) {
	          con.reject(err);
	        });
	        pendingConnects = [];
	        connecting = false;
	      });
	    }

    this.applicationNodes = function() {
      var nodesByName = new Map();
      appConnections.forEach(function(con) {
        con.root().forEachChild(function(app) {
          if (isApplicationNode(app)) {
            var existing = nodesByName.get(app.name());
            // Prefer valid nodes over invalid ones
            if (!existing || (!existing.isValid() && app.isValid())) {
              nodesByName.set(app.name(), app);
            }
          }
        });
      });
      return Array.from(nodesByName.values());
    }

    this.isValid = function() {
      return true;
    }

    this.name = function() {
      if (appConnections.length === 0) return undefined;
      return appConnections[0].root().name();
    };

    this.info = function() {
      if (appConnections.length === 0) return undefined;
      return appConnections[0].root().info();
    };

    this.lastValue = function() {
      if (appConnections.length === 0) return undefined;
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
      this_.applicationNodes().forEach(function (app) {
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
      // Only fire callbacks for NEW nodes, not existing ones.
      // Use forEachChild() to iterate existing children.
      structureSubscriptions.push(structureConsumer);
      // Trigger an initial structure refresh to discover current state.
      // After this, the server pushes eStructureChangeResponse (id 0)
      // when siblings start/stop.
      requestStructureRefresh();
    };

    this.async.unsubscribeFromStructure = function(structureConsumer) {
      removeFirst(structureSubscriptions, function(s) { return s === structureConsumer; });
    };

    this.async.subscribeToEvents = function(eventConsumer, startingFrom) {
      this_.applicationNodes().forEach(function (app) {
        app.async.subscribeToEvents(eventConsumer, startingFrom);
      });
    };

    this.async.unsubscribeFromEvents = function(eventConsumer) {
      this_.applicationNodes().forEach(function (app) {
        app.async.unsubscribeFromEvents(eventConsumer);
      });
    };


    this.async.addChild = function(name, modelName) {

    };

    this.async.removeChild = function(name) {

    };

    this.async.setValue = function(value, timestamp) {

    };

    this._getAppConnections = function() {
      return appConnections;
    };

    /**
     * Close all connections managed by this system node.
     */
	    this.close = function() {
	      isClosed = true;
	      connectGeneration++;
	      var err = new Error('Connection closed');
	      pendingConnects.forEach(function(con) {
	        try {
	          con.reject(err);
	        } catch (e) { /* ignore */ }
	      });
	      pendingConnects = [];
	      pendingFetches = [];
	      connected = false;
	      connecting = false;
	      appConnections.forEach(function(con) {
	        try {
	          con.invalidateAllNodes();
	        } catch (e) { /* ignore */ }
	      });
	      appConnections.forEach(function(con) {
	        con.close();
	      });
	      appConnections = [];
	      knownSiblings.clear();
	      connectedSiblings.clear();
	      announcedApps.clear();
	      everSeenApps.clear();
	      connectionLocalApps.clear();
	      // Reject all pending find waiters
	      pendingFindWaiters.forEach(function(waiter) {
	        waiter.reject(new Error("Client closed"));
	      });
	      pendingFindWaiters = [];
	      structureSubscriptions = [];
	    };

  };

  // Transport abstraction for WebSocket and ServiceMessage multiplexing
  function Transport() {
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
  }
  Transport.prototype.send = function(bytes) { throw new Error("send not implemented"); };
  Transport.prototype.close = function() { throw new Error("close not implemented"); };

  function WebSocketTransport(url, binaryType) {
    Transport.call(this);
    this.reconnect(url, binaryType);
  }
  WebSocketTransport.prototype = Object.create(Transport.prototype);
  WebSocketTransport.prototype.send = function(bytes) { this.ws.send(bytes); };
  WebSocketTransport.prototype.close = function() { this.ws.close(); };
  WebSocketTransport.prototype.readyState = function() { return this.ws.readyState; };
  WebSocketTransport.prototype.reconnect = function(url, binaryType) {
    var self = this;
    if (this.ws) {
      this.ws.onclose = null;  // Prevent triggering close handler
      this.ws.close();
    }
    this.ws = new WebSocket(url);
    this.ws.binaryType = binaryType;
    this.ws.onopen = function(e) { self.onopen && self.onopen(e); };
    this.ws.onmessage = function(e) { self.onmessage && self.onmessage(e); };
    this.ws.onclose = function(e) { self.onclose && self.onclose(e); };
    this.ws.onerror = function(e) { self.onerror && self.onerror(e); };
  };

  obj.AppConnection = function(urlOrTransport, notificationListener, autoConnect) {
    var appConnection = this;
    var appUrl;
    var socketTransport;
    var isPrimaryConnection;

    if (typeof urlOrTransport === 'string') {
      appUrl = composeUrl(urlOrTransport);
      socketTransport = new WebSocketTransport(appUrl, proto.BINARY_TYPE);
      isPrimaryConnection = true;
    } else {
      socketTransport = urlOrTransport;
      isPrimaryConnection = false;
    }

    var handler = new proto.Handler(socketTransport, notificationListener);
    var requests = [];
    var nodeMap = new Map();
    var systemNode = new AppNode(appConnection, proto.SYSTEM_NODE_ID);
    var onClosed;
    var onMessage;
    var onError;
    var onOpen;
    var reauthRequestPending = false;
    var availableServices = new Map();
    var serviceConnections = new Map();
    var serviceInstances = new Map();
    var instanceCounters = new Map();
    var servicesTimeoutId = null;
    var reconnectTimeoutId = null;
    var currentMetadata = null;
    var closedIntentionally = false;  // Set by close() to prevent reconnection
    var hasNotifiedDisconnect = false; // Guard for onDisconnected lifecycle callback
    var hasConnectedBefore = false; // Distinguishes initial connect from reconnect
    var SERVICES_TIMEOUT_MS = (INACTIVITY_RESEND_INTERVAL_S + 30) * 1000;
    var reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
    var lastServerMessageTime = 0; // for stall detection
    var stallCheckIntervalId = null;
    var STALL_CHECK_INTERVAL_MS = 15000; // check every 15s
    var STALL_TIMEOUT_MS = (INACTIVITY_RESEND_INTERVAL_S + 30) * 1000; // must exceed inactivityResendInterval
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

    this.services = function() {
      return availableServices;
    };

    this.invalidateAllNodes = function() {
      nodeMap.forEach(function(node) {
        node.invalidate();
      });
    };

    function allocateInstanceId(serviceId) {
      var next = instanceCounters.get(serviceId) || 0;
      instanceCounters.set(serviceId, next + 1);
      return next;
    }

    var CONNECT_TIMEOUT_MS = 30000; // 30 second timeout for connect calls
    var PROXY_MIN_COMPAT_VERSION = proto.PROXY_MIN_COMPAT_VERSION; // From protocol namespace

    // Helper to schedule reconnection with exponential backoff
    function scheduleReconnect(logMessage) {
      if (!autoConnect || !isPrimaryConnection || reconnectTimeoutId) return;
      var delay = reconnectDelayMs;
      // Add jitter (±20%) to prevent thundering herd
      var jitter = delay * 0.2 * (2 * Math.random() - 1);
      delay = Math.round(delay + jitter);
      reconnectTimeoutId = setTimeout(function() {
        reconnectTimeoutId = null;
        if (!socketTransport) return;
        // Ensure proxy state is cleaned up (may already be done by onClosed, but
        // onError can fire without onClose in Node.js — idempotent if already clean)
        cleanupPrimaryConnectionState();
        console.log(logMessage + " (backoff: " + delay + "ms)");
        socketTransport.reconnect(appUrl, proto.BINARY_TYPE);
        handler = new proto.Handler(socketTransport, notificationListener);
        handler.onContainer = handleIncomingContainer;
      }, delay);
      // Exponential backoff: double up to 30s max
      reconnectDelayMs = Math.min(reconnectDelayMs * 2, MAX_RECONNECT_DELAY_MS);
    }

    function removeServiceConnection(instanceKey, closedByUser) {
      if (serviceConnections.has(instanceKey)) {
        serviceConnections.delete(instanceKey);
        if (appConnection.onServiceConnectionRemoved) {
          appConnection.onServiceConnectionRemoved(instanceKey, closedByUser);
        }
      }
    }

    function makeServiceTransport(serviceId) {
      var transport = new Transport();
      var instanceId = allocateInstanceId(serviceId);
      var instanceKey = serviceId + ':' + instanceId;
      var connectTimeoutId = null;
      var isConnected = false;
      var isClosed = false;
      var pendingSends = [];

      // Cleanup helper - consolidates repeated cleanup pattern
      function cleanup() {
        isConnected = false;
        isClosed = true;
        clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
        serviceInstances.delete(instanceKey);
        removeServiceConnection(instanceKey, !!transport._closedByUser);
        pendingSends = [];
      }

      function wireInstance() {
        connectTimeoutId = setTimeout(function() {
          if (!isConnected && serviceInstances.has(instanceKey)) {
            var service = availableServices.get(serviceId);
            var serviceName = service ? service.name : serviceId;
            console.error("Connecting to service '" + serviceName + "' timed out after " + (CONNECT_TIMEOUT_MS/1000) + " seconds.");
            transport.onerror && transport.onerror({ data: 'Connect timeout' });
            transport.onclose && transport.onclose({ code: 1006, reason: 'Connect timeout' });
            appConnection.sendServiceMessage(serviceId, instanceId, proto.ServiceMessageKind.eDisconnect);
            cleanup();
          }
        }, CONNECT_TIMEOUT_MS);

        serviceInstances.set(instanceKey, {
          onMessage: function(serviceMsg) {
            if (serviceMsg.kind === proto.ServiceMessageKind.eConnected) {
              if (isConnected) return;  // Guard against duplicate eConnected messages
              isConnected = true;
              clearTimeout(connectTimeoutId);
              connectTimeoutId = null;
              pendingSends.forEach(function(bytes) {
                appConnection.sendServiceMessage(serviceId, instanceId, proto.ServiceMessageKind.eData, bytes);
              });
              pendingSends = [];
              transport.onopen && transport.onopen({});
            } else if (serviceMsg.kind === proto.ServiceMessageKind.eData) {
              transport.onmessage && transport.onmessage({ data: serviceMsg.payload });
            } else if (serviceMsg.kind === proto.ServiceMessageKind.eError) {
              cleanup();
              transport.onerror && transport.onerror({ data: 'Service error' });
              transport.onclose && transport.onclose({ code: 1006, reason: 'Service error' });
            } else if (serviceMsg.kind === proto.ServiceMessageKind.eDisconnect) {
              cleanup();
              transport.onclose && transport.onclose({ code: 1000, reason: 'Service closed' });
            }
          }
        });

        appConnection.sendServiceMessage(serviceId, instanceId, proto.ServiceMessageKind.eConnect);
      }

      wireInstance();

      transport.send = function(bytes) {
        if (isClosed) return;  // Ignore sends after close
        if (isConnected) {
          appConnection.sendServiceMessage(serviceId, instanceId, proto.ServiceMessageKind.eData, bytes);
        } else {
          pendingSends.push(bytes);
        }
      };
      transport.close = function() {
        if (isClosed) return;  // Already closed
        transport._closedByUser = true;
        cleanup();
        appConnection.sendServiceMessage(serviceId, instanceId, proto.ServiceMessageKind.eDisconnect);
      };
      transport.readyState = function() {
        if (isClosed) return WebSocket.CLOSED;
        return isConnected ? WebSocket.OPEN : WebSocket.CONNECTING;
      };
      transport.instanceKey = function() {
        return instanceKey;
      };
      // Reconnect with a new service instance (analogous to WebSocketTransport.reconnect)
      transport.reconnect = function(newServiceId) {
        // Clear the old connect timeout to prevent it from killing the new connection
        clearTimeout(connectTimeoutId);
        connectTimeoutId = null;
        serviceId = newServiceId;
        instanceId = allocateInstanceId(serviceId);
        instanceKey = serviceId + ':' + instanceId;
        isConnected = false;
        isClosed = false;
        pendingSends = [];
        wireInstance();
      };

      return { transport: transport, instanceKey: instanceKey };
    }

    function resendServicesRequest() {
      if (currentMetadata && currentMetadata.compatVersion >= PROXY_MIN_COMPAT_VERSION) {
        console.log("Did not receive services notification within expected interval. Re-requesting services.");
        send(proto.createServicesRequestBytes());
        resetServicesTimeout();
      }
    }

    function resetServicesTimeout() {
      clearTimeout(servicesTimeoutId);
      if (currentMetadata && currentMetadata.compatVersion >= PROXY_MIN_COMPAT_VERSION && isPrimaryConnection) {
        servicesTimeoutId = setTimeout(resendServicesRequest, SERVICES_TIMEOUT_MS);
      }
    }

    function clearServicesTimeout() {
      clearTimeout(servicesTimeoutId);
      servicesTimeoutId = null;
    }

    // Stall detection: force-close socket if no server messages for STALL_TIMEOUT_MS
    // while there are active subscriptions expecting data. Without subscriptions,
    // silence is expected and not a stall.
    function hasAnyActiveSubscriptions() {
      for (var node of nodeMap.values()) {
        if (node.hasSubscriptions()) return true;
      }
      return false;
    }

    // Stall detection runs only on the primary connection. In direct mode, sibling
    // stalls are detected via REMOVE events when the primary's structure updates.
    // In proxy mode, sibling traffic flows through the primary, so one timer covers all.
    function startStallDetection() {
      if (stallCheckIntervalId || !isPrimaryConnection) return;
      lastServerMessageTime = Date.now();
      stallCheckIntervalId = setInterval(function() {
        if (lastServerMessageTime > 0 && hasAnyActiveSubscriptions() &&
            Date.now() - lastServerMessageTime > STALL_TIMEOUT_MS) {
          console.log("Connection stalled: no server messages for " + STALL_TIMEOUT_MS + "ms with active subscriptions, forcing reconnect");
          lastServerMessageTime = 0; // prevent repeated fires
          socketTransport.close();
        }
      }, STALL_CHECK_INTERVAL_MS);
    }

    function stopStallDetection() {
      clearInterval(stallCheckIntervalId);
      stallCheckIntervalId = null;
    }

    function cleanupPrimaryConnectionState() {
      if (!isPrimaryConnection) return;
      // Notify service instances of disconnect
      var keysToDisconnect = Array.from(serviceConnections.keys());
      keysToDisconnect.forEach(function(instanceKey) {
        if (serviceInstances.has(instanceKey)) {
          serviceInstances.get(instanceKey).onMessage({ kind: proto.ServiceMessageKind.eDisconnect });
        }
      });
      serviceConnections.clear();
      serviceInstances.clear();
      instanceCounters.clear();
      availableServices.clear();
      currentMetadata = null;
      requests = [];
      stopStallDetection();
    }

    this.onServicesReceived = function(services, metadata) {
      currentMetadata = metadata;

      // Build set of received service IDs
      var receivedServiceIds = new Set(services.map(function(s) { return Number(s.serviceId); }));

      // Remove connections for services that are no longer present
      if (isPrimaryConnection) {
        var removedInstanceKeys = [];
        serviceConnections.forEach(function(conn, instanceKey) {
          var serviceId = Number(instanceKey.split(':')[0]);
          if (!receivedServiceIds.has(serviceId)) {
            removedInstanceKeys.push(instanceKey);
          }
        });
        removedInstanceKeys.forEach(function(instanceKey) {
          // Send disconnect to service transport - this will trigger onclose which handles cleanup
          if (serviceInstances.has(instanceKey)) {
            serviceInstances.get(instanceKey).onMessage({ kind: proto.ServiceMessageKind.eDisconnect });
          }
        });
      }

      availableServices.clear();
      services.forEach(function(service) {
        // Convert serviceId to Number for consistent Map key type (protobufjs v7 returns Long for uint64)
        availableServices.set(Number(service.serviceId), service);
      });

      if (!isPrimaryConnection) {
        return;
      }

      if (appConnection.onServicesUpdated) {
        appConnection.onServicesUpdated();
      }

      resetServicesTimeout();
    };

    // Normalize host address by stripping ws://, wss://, and trailing slashes
    function normalizeHost(host) {
      if (!host) return host;
      return host.replace(/^wss?:\/\//, '').replace(/\/$/, '');
    }

    this.findProxyService = function(addr, port) {
      var portStr = String(port);
      var normalizedAddr = normalizeHost(addr);
      // Use for...of to allow early exit when found (forEach can't break)
      for (var service of availableServices.values()) {
        var serviceIp = service.metadata && service.metadata.ip_address;
        if (service.type === 'websocketproxy' &&
            serviceIp &&
            service.metadata.port &&
            service.metadata.proxy_type === 'studioapi') {
          var serviceAddr = normalizeHost(serviceIp);
          if (serviceAddr === normalizedAddr && service.metadata.port === portStr) {
            return service;
          }
        }
      }
      return null;
    };

    this.isProxyAvailable = function(addr, port) {
      return !!this.findProxyService(addr, port);
    };

    this.connectViaProxy = function(addr, port, existingConnection) {
      var service = this.findProxyService(addr, port);
      if (!service) {
        return Promise.reject("No matching proxy service found for " + addr + ":" + port);
      }

      var proxyConnection;
      var newServiceId = Number(service.serviceId);

      if (existingConnection) {
        // Reconnect existing transport with new service instance — preserves nodes and callbacks
        proxyConnection = existingConnection;
        var transport = proxyConnection._getTransport();
        // Set onopen to trigger handler recreation + resubscribe (the original onopen
        // was overwritten by the first connectViaProxy call's new-connection handler)
        transport.onopen = function() {
          proxyConnection._triggerReconnect();
        };
        // Transport.reconnect() allocates a new instance and fires onopen when connected
        transport.reconnect(newServiceId);
        var instanceKey = transport.instanceKey();
        proxyConnection.instanceKey = instanceKey;
        serviceConnections.set(instanceKey, proxyConnection);
      } else {
        var result = makeServiceTransport(newServiceId);
        proxyConnection = new obj.AppConnection(result.transport, notificationListener, autoConnect);
        proxyConnection.instanceKey = result.instanceKey;
        proxyConnection.siblingKey = addr + ':' + port;
        serviceConnections.set(result.instanceKey, proxyConnection);
      }

      // Wait for connection AND structure to be ready before resolving
      return new Promise(function(resolve, reject) {
        var settled = false;

        function rejectOnce(err) {
          if (!settled) {
            settled = true;
            reject(err);
          }
        }

        if (!existingConnection) {
          var transport = proxyConnection._getTransport();
          transport.onopen = function() {
            if (appConnection.onServiceConnectionEstablished) {
              appConnection.onServiceConnectionEstablished(proxyConnection, proxyConnection.instanceKey);
            }
            // Wait for structure before resolving
            var sys = proxyConnection.root();
            sys.async.onDone(function() {
              if (!settled) {
                settled = true;
                resolve(proxyConnection);
              }
            }, function() {
              rejectOnce(new Error('Connection closed before structure'));
            }, sys);
          };
          transport.onerror = function(event) {
            rejectOnce(new Error(event.data || 'Connection error'));
          };
          transport.onclose = function(event) {
            rejectOnce(new Error(event.reason || 'Connection closed'));
          };
        } else {
          // For reconnection, the AppConnection's onOpen calls resubscribe(systemNode).
          // We just need to wait for structure to resolve the promise.
          var sys = proxyConnection.root();
          sys.async.onDone(function() {
            if (!settled) {
              settled = true;
              resolve(proxyConnection);
            }
          }, function() {
            rejectOnce(new Error('Connection closed before structure'));
          }, sys);
        }
      });
    };

    this.onServiceMessage = function(serviceMessage) {
      // Convert to Number for consistent key type (protobufjs v7 returns Long for uint64)
      var instanceKey = Number(serviceMessage.serviceId) + ':' + Number(serviceMessage.instanceId || 0);
      var instanceHandler = serviceInstances.get(instanceKey);
      if (instanceHandler) {
        instanceHandler.onMessage(serviceMessage);
      }
    };

    this.sendServiceMessage = function(serviceId, instanceId, kind, payload) {
      var serviceMessage = proto.ServiceMessage.create({
        serviceId: serviceId,
        instanceId: instanceId,
        kind: kind
      });
      if (payload) {
        serviceMessage.payload = payload;
      }
      var msg = proto.Container.create();
      msg.messageType = proto.ContainerType.eServiceMessage;
      msg.serviceMessage = [serviceMessage];
      send(proto.Container.encode(msg).finish());
    };

    // Returns true if proxy protocol is supported (compat >= PROXY_MIN_COMPAT_VERSION)
    // When true, backends are accessed via ServiceMessage tunneling, not direct connections
    this.supportsProxyProtocol = function() {
      if (typeof process !== 'undefined' && process.env && process.env.CDP_FORCE_DIRECT_MODE === '1')
        return false;
      return currentMetadata && currentMetadata.compatVersion >= PROXY_MIN_COMPAT_VERSION;
    };

    onMessage = function(evt) { handler.handle(evt.data); };
    onError = function (ev) {
      if (closedIntentionally) return;
      console.log("Socket error: " + ev.data);
      // Schedule reconnect on error if close doesn't fire (Node.js ws behavior)
      scheduleReconnect("Retrying reconnect after error...");
    };
    onOpen = function() {
      // Clear any pending reconnect timeout since we're now connected
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
      reconnectDelayMs = INITIAL_RECONNECT_DELAY_MS;
      hasNotifiedDisconnect = false; // Reset disconnect guard for next cycle
      startStallDetection();
      // Note: For proxy connections, connectViaProxy overwrites transport.onopen
      // with _triggerReconnect(), so this handler only fires for the primary connection.
      // Primary handler recreation happens in scheduleReconnect before reconnect().
      appConnection.resubscribe(systemNode);
      // Notify lifecycle callback after structure refetch completes (not on initial connect)
      if (hasConnectedBefore && appConnection.onReconnected) {
        systemNode.async.onDone(function() {
          appConnection.onReconnected();
        }, function(err) {
          console.error("Structure refetch failed on reconnect:", err);
        }, systemNode);
      }
      hasConnectedBefore = true;
    };
    onClosed = function (event) {
      if (closedIntentionally) return;

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

      // Notify lifecycle callback once per disconnect (not on each reconnection attempt)
      if (!hasNotifiedDisconnect && appConnection.onDisconnected) {
        hasNotifiedDisconnect = true;
        appConnection.onDisconnected();
      }

      clearServicesTimeout();
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
      reauthRequestPending = false;  // Reset to allow reauth on reconnect
      cleanupPrimaryConnectionState();

      scheduleReconnect("Trying to reconnect " + appUrl);
    };

    socketTransport.onopen = onOpen;
    socketTransport.onclose = onClosed;
    socketTransport.onmessage = onMessage;
    socketTransport.onerror = onError;

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
      if (!socketTransport) return;  // Connection was closed
      if (socketTransport.readyState() == WebSocket.OPEN) {
        socketTransport.send(message);
      } else {
        requests.push(message);
      }
    }

    function flushRequests() {
      if (!socketTransport) return;  // Connection was closed
      for (var i = 0; i < requests.length; i++) {
        socketTransport.send(requests[i]);
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
      if (sampleRate !== undefined) {
        request.sampleRate = sampleRate;
      }
      if (stop) {
        request.stop = stop;
      } else {
        request.inactivityResendInterval = INACTIVITY_RESEND_INTERVAL_S;
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
      } else {
        request.inactivityResendInterval = INACTIVITY_RESEND_INTERVAL_S;
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
      // Set flag BEFORE async to prevent race condition with rapid AUTH_RESPONSE_EXPIRED errors
      reauthRequestPending = true;
      proto.CreateAuthRequest(dict, challenge)
        .then(function(request){
          var msg = proto.Container.create();
          msg.messageType = proto.ContainerType.eReauthRequest;
          msg.reAuthRequest = request;
          send(proto.Container.encode(msg).finish());
        })
        .catch(function(err) {
          console.error("Failed to create reauth request:", err);
          reauthRequestPending = false;
        });
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
      // Collect nodes to remove first to avoid modifying Map during iteration
      // Use forEachChildImmediate to iterate directly without structureFetched check
      // (during structure parsing, structureFetched is false until done() is called)
      var toRemove = [];
      parentNode.forEachChildImmediate(function (childNode, name) {
        if (names.indexOf(name) === -1) {
          toRemove.push(childNode);
        }
      });
      toRemove.forEach(function(childNode) {
        parentNode.remove(childNode);
        nodeMap.delete(childNode.id());
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
        if (node) {
          node.receiveValue(proto.valueFromVariant(variantValue, node.info().valueType), variantValue.timestamp);
        }
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
          reauthRequestPending = false;  // Allow retry on next eAUTH_RESPONSE_EXPIRED
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
        reauthRequestPending = true;  // Set BEFORE async to prevent duplicate reauth calls
        var userAuthResult = new studio.api.UserAuthResult(proto.AuthResultCode.eReauthenticationRequired, protoResponse.text, null);
        metadata.challenge = protoResponse.challenge;
        reauthenticate(userAuthResult, metadata);
      }
      else
        console.log("Received error response with code " + protoResponse.code
          + ' and text: "' + protoResponse.text + '"');
    }

    function handleIncomingContainer(protoContainer, metadata) {
      lastServerMessageTime = Date.now(); // Update stall detection timestamp
      // Set currentMetadata from Hello message immediately (not just on ServicesNotification)
      // This ensures supportsProxyProtocol() works before ServicesNotification arrives
      if (!currentMetadata && metadata) {
        currentMetadata = metadata;
        // Start services timeout for primary connections with proxy support
        // This handles the case where ServicesNotification is never received
        if (isPrimaryConnection && metadata.compatVersion >= PROXY_MIN_COMPAT_VERSION && !servicesTimeoutId) {
          resetServicesTimeout();
        }
      }
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
          break;
        case proto.ContainerType.eServicesNotification:
          if (protoContainer.servicesNotification && protoContainer.servicesNotification.services) {
            appConnection.onServicesReceived(protoContainer.servicesNotification.services, metadata);
          }
          break;
        case proto.ContainerType.eServiceMessage:
          if (protoContainer.serviceMessage) {
            protoContainer.serviceMessage.forEach(function(msg) {
              appConnection.onServiceMessage(msg);
            });
          }
          break;
        default:
          //TODO: Indicate error to Client
      }
      flushRequests();
    }

    this._getTransport = function() {
      return socketTransport;
    };

    // Trigger reconnection logic for proxy connections (called by connectViaProxy on reconnect)
    this._triggerReconnect = function() {
      handler = new proto.Handler(socketTransport, notificationListener);
      handler.onContainer = handleIncomingContainer;
      appConnection.resubscribe(systemNode);
    };

    /**
     * Close this connection.
     * For proxy connections, this sends a disconnect message through the service tunnel.
     * For primary connections, this closes the WebSocket.
     */
    this.close = function() {
      // Mark as intentionally closed to prevent reconnection attempts
      closedIntentionally = true;
      // Clear pending reconnect to prevent accessing null socketTransport
      clearTimeout(reconnectTimeoutId);
      reconnectTimeoutId = null;
      // Clear services timeout to prevent timer firing after close
      clearServicesTimeout();
      // Reset auth state to prevent stale state on reconnect
      reauthRequestPending = false;
      cleanupPrimaryConnectionState();
      if (socketTransport) {
        var transport = socketTransport;
        socketTransport = null;  // Guard against double-close
        transport.close();
      }
    };
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
  // No default timeout — find() waits indefinitely for the app to appear.
  // Use { timeout: 30000 } for explicit timeout, { timeout: 0 } for immediate fail.

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
     * Returns synchronously for cached nodes.
     *
     * @param name
     * @returns {Promise.<INode>} Promise that resolves to INode or rejects if child not found.
     */
    this.child = function(name) {
      // SystemNode provides synchronous child access
      if (node.applicationNodes) {
        var childNode = node.child(name);
        if (childNode) {
          return Promise.resolve(new INode(childNode));
        } else {
          return Promise.reject("Child named '" + name + "' not found");
        }
      }

      // Helper to resolve a child node, fetching structure if needed
      function resolveChild(childNode, resolve, reject) {
        if (!childNode) {
          reject("Child named '" + name + "' not found");
          return;
        }
        var iNode = new INode(childNode);
        if (!childNode.isStructureFetched()) {
          childNode.async.fetch();
          childNode.async.onDone(resolve, reject, iNode);
        } else {
          resolve(iNode);
        }
      }

      // AppNode - async access for children that may need structure fetching
      if (node.isValid()) {
        return new Promise(function (resolve, reject) {
          if (node.isStructureFetched()) {
            resolveChild(node.child(name), resolve, reject);
          } else {
            node.async.fetch();
            node.async.onDone(function () {
              resolveChild(node.child(name), resolve, reject);
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
      }).catch(function (err) {
        console.log("subscribeToChildValues() Child not found: " + name, err);
      });
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
      }).catch(function (err) {
        console.log("unsubscribeFromChildValues() Child not found: " + name, err);
      });
    };

    /**
     * Structure callback used by structure subscribe/unsubscribe.
     *
     * @callback structureConsumer
     * @param {string} node name
     * @param {number} change - ADD (1), REMOVE (0), or RECONNECT (2) from studio.api.structure
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
    var findNodeCacheInvalidator = null;  // Set after findNodeCache is created

    var system = new internal.SystemNode(studioURL, notificationListener, function(appName) {
      // Called when app structure changes (ADD or REMOVE)
      findNodeCacheInvalidator(appName);
    });

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
     * Close all connections.
     */
    this.close = function() {
      system.close();
    };

    var findNodeCache = (function() {
      var memoize = {};
      var nodes = {};

      function f(promise, nodeName, index, arr) {
        var path = arr.slice(0,index+1).join('.');
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

      // Invalidate cache entries for a specific app name (called on structure changes)
      f.invalidateApp = function(appName) {
        Object.keys(memoize).forEach(function(key) {
          if (key === appName || key.startsWith(appName + '.')) {
            delete memoize[key];
            delete nodes[key];
          }
        });
      };

      return f;
    })();
    var findNode = findNodeCache;
    findNodeCacheInvalidator = findNodeCache.invalidateApp;
    /**
     * Request node with provided path. Waits indefinitely for the target app
     * to appear if it is not yet available.
     *
     * @param nodePath Dot-separated path to target node (e.g. 'App2.CPULoad').
     * @param options Optional. { timeout: milliseconds } to limit wait time.
     *   Use { timeout: 0 } to fail immediately if the app is not available.
     * @returns {Promise.<INode>} A promise containing requested node when fulfilled.
     */
    this.find = function(nodePath, options) {
      if (!nodePath) {
        return Promise.reject("Child not found: ");
      }
      var pathParts = nodePath.split(".");
      var appName = pathParts[0];
      var self = this;

      function doFind() {
        // In direct mode, reject if the app was previously connected but is now
        // disconnected. This prevents returning stale nodes whose connection is down.
        // In proxy mode, the node tree is maintained by the primary connection so
        // stale access is not an issue — the primary connection handles structure.
        if (system.isDirectMode() && system.wasAppSeen(appName) && !system.isAppAvailable(appName)) {
          return Promise.reject(appName + " is not available");
        }
        return pathParts.reduce(findNode, self.root());
      }

      // timeout: 0 means immediate fail (old behavior)
      if (options && options.timeout === 0) {
        return doFind();
      }

      // timeout > 0 means wait up to that many ms; no timeout means wait indefinitely
      var timeoutMs = (options && options.timeout > 0) ? options.timeout : 0;

      // Trigger connection before waiting — prevents deadlock when find()
      // is called without a prior root() call. Surface connection errors
      // to the caller instead of swallowing them.
      return self.root().then(function() {
        return system.waitForApp(appName, timeoutMs);
      }).then(function() {
        return doFind();
      });
    };

    this._getAppConnections = function() {
      return system._getAppConnections();
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

