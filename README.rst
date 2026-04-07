CDP Client
==========

A simple Javascript interface for the CDP Studio development platform that allows Javascript applications to interact with
CDP Applications - retrieve CDP Application structures and read-write object values. For more information
about CDP Studio see https://cdpstudio.com/.

Installation
------------

::

    $ npm install cdp-client

Example
-------

    .. code:: javascript

        const studio = require("cdp-client");

        const client = new studio.api.Client("127.0.0.1:7690", {
          credentialsRequested: async (request) => {
            return { Username: "cdpuser", Password: "cdpuser" };
          }
        });

        function subscribeToApp(appName) {
          client.find(appName + '.CPULoad').then(node => {
            node.subscribeToValues(value => {
              console.log(`[${appName}] CPULoad: ${value}`);
            });
          }).catch(() => {}); // Not all apps have CPULoad
        }

        client.root().then(root => {
          root.forEachChild(app => subscribeToApp(app.name()));
          root.subscribeToStructure((name, change) => {
            if (change === studio.api.structure.ADD)
              subscribeToApp(name);
            if (change === studio.api.structure.RECONNECT)
              console.log(`${name} restarted, subscriptions intact`);
          });
        }).catch(err => console.error("Connection failed:", err));

Proxy Support (CDP 5.1+)
------------------------

CDP 5.1 introduced proxy support which allows a single WebSocket connection to access
multiple backend CDP applications through multiplexing. In older CDP versions, the client
connected directly to each CDP application, meaning a dedicated port had to be opened for
each application.

When connecting to a CDP 5.1+ application configured as a proxy, the client automatically
discovers and connects to all backend applications. All discovered applications appear as
children of the root system node, enabling transparent access to their structure and values
through the standard API. The example above works the same whether the server has proxy
support or not.

Benefits
~~~~~~~~

- Simplified firewall configuration - only one port needs to be opened
- SSH port forwarding - forward a single port to access entire CDP system

Structure Events
----------------

On the root node, ``subscribeToStructure`` tracks application lifecycle:

- ``studio.api.structure.ADD`` (1) — An application appeared for the first time
- ``studio.api.structure.DISCONNECT`` (3) — An application went offline (may reconnect)
- ``studio.api.structure.RECONNECT`` (2) — An application restarted (was seen before, went offline, came back)

On other nodes, ``subscribeToStructure`` fires when children are added or removed
(e.g. components or operators added to a running application):

- ``studio.api.structure.ADD`` (1) — A child node was added
- ``studio.api.structure.REMOVE`` (0) — A child node was removed

When an app restarts, the client automatically restores value and event subscriptions,
so user code does not need to re-subscribe. RECONNECT is informational — use it for
logging or UI updates.

    .. code:: javascript

        client.root().then(root => {
          root.subscribeToStructure((appName, change) => {
            if (change === studio.api.structure.ADD) {
              console.log(`New app online: ${appName}`);
              client.find(appName + '.CPULoad').then(node => {
                node.subscribeToValues(v => console.log(`[${appName}] CPULoad: ${v}`));
              }).catch(err => console.error(`Failed to find ${appName}.CPULoad:`, err));
            }
            if (change === studio.api.structure.DISCONNECT) {
              console.log(`App offline: ${appName}`);
            }
            if (change === studio.api.structure.RECONNECT) {
              console.log(`App restarted: ${appName}, subscriptions intact`);
            }
          });
        }).catch(err => console.error("Connection failed:", err));

API
---

Each node in public CDP Application structure tree is represented by INode object in the API.
INode object may have an a value depending on the kind of CDP object it reflects and it
may also have other INode objects as children.

Before all examples, you need:

**Browser (Script Tag):**

    .. code:: html

        <script src="./protobuf.min.js"></script>
        <script src="./studioapi.proto.js"></script>
        <script src="./index.js"></script>
        <script>
          // studio is now available as a global
          var client = new studio.api.Client(...);
        </script>

**Node.js (CommonJS):**

    .. code:: javascript

        const studio = require("cdp-client")

Global API
~~~~~~~~~~

studio.api.Request(systemName, applicationName, cdpVersion, systemUseNotification)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    systemName - System name the application belongs to.

    applicationName - Application name.

    cdpVersion - CDP version the application is built with.

    systemUseNotification - System use notification message to ask for confirmation to continue.

- Returns

    The created Request object.

Instance Methods / Request
~~~~~~~~~~~~~~~~~~~~~~~~~~

request.systemName()
^^^^^^^^^^^^^^^^^^^^

- Returns

    System name the application belongs to.

request.applicationName()
^^^^^^^^^^^^^^^^^^^^^^^^^

- Returns

    Application name.

request.cdpVersion()
^^^^^^^^^^^^^^^^^^^^

- Returns

    CDP version the application is built with.

request.systemUseNotification()
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Returns

    System use notification message to ask for confirmation to continue.

request.userAuthResult()
^^^^^^^^^^^^^^^^^^^^^^^^

- Returns

    Authentication response if security is enabled.


studio.api.UserAuthResult(code, text, additionalCredentials)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    code - response code.

    text - response info/error.

    additionalCredentials - Returns additional credentials if required by received response code.

- Returns

    The created UserAuthResult object.

Instance Methods / UserAuthResult
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

result.code()
^^^^^^^^^^^^^

- Returns

    Authentication response code.

    +---------------------------------+----------------------------------------------+---------------------------------------------------------------------------------------+
    | Type                            | Value                                        | Description                                                                           |
    +=================================+==============================================+=======================================================================================+
    | studio.protocol.AuthResultCode  | Optional: One of the following:              |                                                                                       |
    +                                 +----------------------------------------------+---------------------------------------------------------------------------------------+
    |                                 | - eCredentialsRequired                       |                                                                                       |
    +                                 +----------------------------------------------+---------------------------------------------------------------------------------------+
    |                                 | - eGranted                                   |                                                                                       |
    +                                 +----------------------------------------------+---------------------------------------------------------------------------------------+
    |                                 | - eGrantedPasswordWillExpireSoon             | expiry timestamp is provided by text()                                                |
    +                                 +----------------------------------------------+---------------------------------------------------------------------------------------+
    |                                 | - eNewPasswordRequired                       | AuthRequest with additional response with new username + password hash is required    |
    +                                 +----------------------------------------------+---------------------------------------------------------------------------------------+
    |                                 | - eInvalidChallengeResponse                  | challenge response sent was invalid                                                   |
    +                                 +----------------------------------------------+---------------------------------------------------------------------------------------+
    |                                 | - eAdditionalResponseRequired                | additional challenge responses based on additional credential types are required.     |
    +                                 +----------------------------------------------+---------------------------------------------------------------------------------------+
    |                                 | - eTemporarilyBlocked                        | authentication is temporarily blocked because of too many failed attempts             |
    +                                 +----------------------------------------------+---------------------------------------------------------------------------------------+
    |                                 | - eNodeIseReauthenticationRequiredInternal   | server requires re-authentication (e.g. because of being idle)                        |
    +---------------------------------+----------------------------------------------+---------------------------------------------------------------------------------------+

result.text()
^^^^^^^^^^^^^

- Returns

    Authentication error or info in text representation.

result.additionalCredentials()
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Returns

    Additional credentials in following structure:

    .. code:: none

        returns {
            string type;
            string prompt;
            Parameter {
                string name;
                string value;
            }
            Parameter parameter = [];
        }

studio.api.Client(uri, notificationListener, autoConnect)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    uri - String containing the address and port of StudioAPI server separated by colon character

    notificationListener - Object returning two functions: applicationAcceptanceRequested(studio.api.Request) and credentialsRequested(studio.api.Request).
      Function applicationAcceptanceRequested must return a Promise of void. Can be used to popup system use notification message and ask for confirmation to continue.
      Function credentialsRequested must return a Promise of dictionary containing 'Username' and 'Password' as keys for authentication.

    autoConnect - Tries to reconnect once disconnected. By default is enabled.

- Returns

    The created client object bound to passed uri.

- Usage

    Create client object to interrogate a CDP Application. The client constructor expects a full
    uri with port number separated by colon pointing to StudioAPI service. For exact IP and Port see
    CDP Application startup output.

- Example

    .. code:: javascript

        // Create client connected to uri provided in browser address bar.
        var client = new studio.api.Client(window.location.host);

    .. code:: javascript

        // Create client with NotificationListener connected to uri provided in browser address bar.
        // The NotificationListener is only called when page requires a login.

        class NotificationListener {
          applicationAcceptanceRequested(request) {
            return new Promise(function(resolve, reject) {
              if (request.systemUseNotification()) {
                // Pop up a System Use Notification message and ask for confirmation to continue,
                // then based on the user answer call either resolve() or reject()
              }
              else
                resolve();
            });
          }

          credentialsRequested(request) {
            return new Promise(function(resolve, reject) {
              if (request.userAuthResult().code() == studio.protocol.AuthResultCode.eCredentialsRequired) {
                // Do something to gather username and password variables (either sync or async way) and then call:
                resolve({Username: "cdpuser", Password: "cdpuser"});
              }
              if (request.userAuthResult().code() == studio.protocol.AuthResultCode.eReauthenticationRequired) {
                // Pop user a message that idle lockout was happened and server requires new authentication to continue:
                resolve({Username: "cdpuser", Password: "cdpuser"});
              }
            });
          }
        }

        var client = new studio.api.Client(window.location.host, new NotificationListener());

    .. code:: javascript

        // Node.js example
        const studio = require("cdp-client");

        const client = new studio.api.Client("127.0.0.1:7689", {
          applicationAcceptanceRequested: async (request) => {
            console.log('Application access requested');
          },
          credentialsRequested: async (request) => {
            return { Username: "cdpuser", Password: "cdpuser" };
          }
        });

        client.root().then(root => {
          console.log("Connected to:", root.name());
        });


Instance Methods / Client
~~~~~~~~~~~~~~~~~~~~~~~~~

client.root()
^^^^^^^^^^^^^

- Returns

    Promise containing root INode object when fulfilled.

- Usage

    Wait for root INode object to be available from connected application. The root node is
    the top-level "system" node that contains the connected applications.

- Example

    .. code:: javascript

        client.root().then(function (system) {
          // use the system INode object to access connected structure.
        });

client.find(path, options)
^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    path - Dot-separated path to target node (e.g. ``'App2.CPULoad'``).

    options - Optional. Without this, find() waits indefinitely for the app to appear.
    ``{ timeout: milliseconds }`` to limit wait time.
    ``{ timeout: 0 }`` to fail immediately if the app is not available.

- Returns

    Promise containing requested INode object when fulfilled.

- Behavior

    When no timeout option is provided, waits indefinitely for the target application to appear.
    If the application is already available, resolves immediately. No prior ``root()`` call is needed — ``find()`` triggers
    the connection internally.

- Examples

    .. code:: javascript

        // Waits indefinitely for App2 to appear
        client.find("App2.CPULoad").then(function (load) {
          load.subscribeToValues(function (value) {
            console.log("CPULoad:", value);
          });
        });

        // Wait up to 5 seconds
        client.find("App2.CPULoad", { timeout: 5000 }).catch(function (err) {
          console.log(err.message); // "App2 not found within 5000ms"
        });

        // Fail immediately if not available (old behavior)
        client.find("App2.CPULoad", { timeout: 0 }).catch(function (err) {
          console.log("Not available right now");
        });

client.close()
^^^^^^^^^^^^^^

- Usage

    Close all connections managed by this client. This stops reconnection attempts
    and cleans up all resources. Call this when you are done using the client.

- Example

    .. code:: javascript

        client.close();

Instance Methods / INode
~~~~~~~~~~~~~~~~~~~~~~~~

node.name()
^^^^^^^^^^^

- Returns

    Node name.

- Usage

    Get the short node name of INode object. Names in a parent node are all unique.

node.info()
^^^^^^^^^^^

- Returns

    Last known internal Info object studio.protocol.Info

- Restriction

    Internal Info object should be used sparingly in client code as it is a protocol object any may change more often.
    Optional object members may not be present on all instances.

- Details

    +------------------+------------------------------+---------------------------------------------------------------+
    | Property         | Type                         | Description                                                   |
    +==================+==============================+===============================================================+
    | Info.nodeId      | number                       | Application wide unique ID for each instance in CDP structure |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.name        | string                       | Nodes short name                                              |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.nodeType    | studio.protocol.CDPNodeType  | | Direct CDP base type of the class. One of the following:    |
    |                  |                              | - CDP_UNDEFINED                                               |
    |                  |                              | - CDP_APPLICATION                                             |
    |                  |                              | - CDP_COMPONENT                                               |
    |                  |                              | - CDP_OBJECT                                                  |
    |                  |                              | - CDP_MESSAGE                                                 |
    |                  |                              | - CDP_BASE_OBJECT                                             |
    |                  |                              | - CDP_PROPERTY                                                |
    |                  |                              | - CDP_SETTING                                                 |
    |                  |                              | - CDP_ENUM                                                    |
    |                  |                              | - CDP_OPERATOR                                                |
    |                  |                              | - CDP_NODE                                                    |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.valueType   | studio.protocol.CDPValueType | | Optional: Value primitive type the node holds               |
    |                  |                              | | if node may hold a value. One of the following:             |
    |                  |                              | - eUNDEFINED                                                  |
    |                  |                              | - eDOUBLE                                                     |
    |                  |                              | - eUINT64                                                     |
    |                  |                              | - eINT64                                                      |
    |                  |                              | - eFLOAT                                                      |
    |                  |                              | - eUINT                                                       |
    |                  |                              | - eINT                                                        |
    |                  |                              | - eUSHORT                                                     |
    |                  |                              | - eSHORT                                                      |
    |                  |                              | - eUCHAR                                                      |
    |                  |                              | - eCHAR                                                       |
    |                  |                              | - eBOOL                                                       |
    |                  |                              | - eSTRING                                                     |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.typeName    | string                       | Optional: Class name of the reflected node                    |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.serverAddr  | string                       | Optional: StudioAPI IP present on application nodes that      |
    |                  |                              | have **Info.isLocal == false**                                |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.serverPort  | number                       | Optional: StudioAPI Port present on application nodes that    |
    |                  |                              | have **Info.isLocal == false**                                |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.isLocal     | boolean                      | Optional: When multiple applications are present in root node |
    |                  |                              | this flag is set to true for the application that the client  |
    |                  |                              | is connected to                                               |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.flags       | studio.protocol.Info.Flags   | | Optional: Node flags. Any of:                               |
    |                  |                              | - eNone                                                       |
    |                  |                              | - eNodeIsLeaf                                                 |
    |                  |                              | - eValueIsPersistent                                          |
    |                  |                              | - eValueIsReadOnly                                            |
    |                  |                              | - eNodeIsRemovable                                            |
    |                  |                              | - eNodeCanAddChildren                                         |
    |                  |                              | - eNodeIsRenamable                                            |
    |                  |                              | - eNodeIsInternal                                             |
    |                  |                              | - eNodeIsImportant                                            |
    +------------------+------------------------------+---------------------------------------------------------------+

node.lastValue()
^^^^^^^^^^^^^^^^

- Returns

    last sent or received value on the node.

- Usage

    Access the last known value of existing INode object.

node.setValue(value, timestamp)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    value

    timestamp - timestamp in nanoseconds since EPOCH presented as long int

- Returns

    last sent or received value on the node.

- Usage

    **Setting value and timestamp (timestamp will be ignored in current implementation).**

node.forEachChild(iteratorCallback)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    Function(child) iteratorCallback - INode object as a child argument

- Usage

    Iterate over children of current node. Iteration starts latest when children for the node are resolved.

- Example

    .. code:: javascript

        cdpapp.forEachChild(function (child) {
          if (child.info().nodeType == studio.protocol.CDPNodeType.CDP_COMPONENT) {
            // Use child object of type {INode} that is a CDP component.
          }
        });

node.child(name)
^^^^^^^^^^^^^^^^

- Arguments

    name - Name of the child to look for

- Returns

    name - Promise containing found child INode object when fulfilled.

- Usage

    Request named child node of this node by given node name.

- Example

    .. code:: javascript

        node.child("CPULoad").then(function (load) {
          // use the load object referring to CPULoad child in current node
        });

node.subscribeToValues(valueConsumer, fs, sampleRate)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    Function(value, timestamp) valueConsumer - timestamp in nanoseconds since EPOCH presented as long int

    fs - maximum frequency that value updates are expected (controls how many changes are sent in a single packet). Defaults to 5 hz.

    sampleRate - maximum amount of value updates sent per second (controls the amount of data transferred). Zero means all samples must be provided. Defaults to 0.

- Usage

    Subscribe to value changes on this node. On each value change valueConsumer function is called
    with value of the nodes valueType and UTC Unix timestamp in nanoseconds (nanoseconds from 01.01.1970).
    Timestamp refers to the time of value change in connected application on target controller.

- Example

    .. code:: javascript

        cpuLoad.subscribeToValues(function (value, timestamp) {
          console.log("CPULoad:" + value + " at " + timestamp);
        });

node.unsubscribeFromValues(valueConsumer)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    Function(value, timestamp) valueConsumer - timestamp in nanoseconds since EPOCH presented as long int

- Usage

    Unsubscribe given callback from value changes on this node.


node.subscribeToChildValues(name, valueConsumer, fs, sampleRate)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    name

    Function(value, timestamp) valueConsumer - timestamp in nanoseconds since EPOCH presented as long int

    fs - maximum frequency that value updates are expected (controls how many changes are sent in a single packet). Defaults to 5 hz.

    sampleRate - maximum amount of value updates sent per second (controls the amount of data transferred). Zero means all samples must be provided. Defaults to 0.

- Usage

    Subscribe to named child's value changes on this node. This is a convenience method,
    see **node.subscribeToValues(valueConsumer)** for more information.

node.unsubscribeFromChildValues(name, valueConsumer)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    name

    Function(value, timestamp) valueConsumer - timestamp in nanoseconds since EPOCH presented as long int

- Usage

    Unsubscribe given callback from child value changes on this node. This is a convenience method,
    see **node.unsubscribeFromValues(valueConsumer)** for more information.

node.subscribeToStructure(structureConsumer)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    Function(name, change) structureConsumer

- Usage

    Subscribe to structure changes on this node.
    On the root node: ADD (1) when an app appears, DISCONNECT (3) when it goes offline,
    RECONNECT (2) when it restarts. On other nodes: ADD (1) when a child is added,
    REMOVE (0) when a child is removed.

node.unsubscribeFromStructure(structureConsumer)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    Function(name, change) structureConsumer

- Usage

    Unsubscribe given callback from structure changes on this node.

node.subscribeToEvents(eventConsumer, timestampFrom)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    Function(event) eventConsumer

    timestampFrom - If 0, then all events are passed from the start of the CDP application.
                    If > 0, events starting from this timestamp (in UTC nanotime) are passed.
                    If not defined, then events from the moment of subscription is passed.

- Usage

    Subscribe to events on this node. On each event eventConsumer function is called with Event argument described here:

    +-------------------+-----------------------------+------------------------------------+--------------------------------------------------------------------------------------+
    | Property          | Type                        | Value                              | Description                                                                          |
    +===================+=============================+====================================+======================================================================================+
    | Event.id          | number                      | Optional: System unique eventId (CDP eventId + handle)                                                                    |
    +-------------------+-----------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | Event.sender      | string                      | Optional: Event sender full name                                                                                          |
    +-------------------+-----------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | Event.code        | studio.protocol.EventCode   | Optional: Event code flags. Any of:                                                                                       |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - aAlarmSet                 | The alarm's Set flag/state was set. The alarm changed state to "Unack-Set"                  |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eAlarmClr                 | The alarm's Set flag was cleared. The Unack state is unchanged.                             |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eAlarmAck                 | The alarm changed state from "Unacknowledged" to "Acknowledged". The Set state is unchanged.|
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eReprise                  | A repetition/update of an event that has been reported before. Courtesy of late subscribers.|
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eSourceObjectUnavailable  | The provider of the event has become unavailable. (disconnected or similar)                 |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eNodeBoot                 | The provider reports that the CDPEventNode just have booted.                                |
    +-------------------+-----------------------------+-----------------------------+---------------------------------------------------------------------------------------------+
    | Event.status      | studio.protocol.EventStatus | Optional: Status flags as a numeric bitfield. Possible flag values:                                           |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eStatusOK                 | No alarm set                                                                                |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eNotifySet                | NOTIFY alarm set                                                                            |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eWarningSet               | WARNING alarm set                                                                           |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eLowLevelSet              | LOW LEVEL alarm set                                                                         |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eHighLevelSet             | HIGH LEVEL alarm set                                                                        |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eErrorSet                 | ERROR alarm set                                                                             |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eLowLowLevelSet           | LOW-LOW LEVEL alarm set                                                                     |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eHighHighLevelSet         | HIGH-HIGH LEVEL alarm set                                                                   |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eEmergencySet             | EMERGENCY LEVEL alarm present                                                               |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eValueForced              | Signal value was forced (overridden)                                                        |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eRepeatBlocked            | Alarm is blocked due to too many repeats                                                    |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eProcessBlocked           | Alarm is blocked by the software                                                            |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eOperatorBlocked          | Alarm is blocked by the user                                                                |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eNotifyUnacked            | NOTIFY alarm unacknowledged                                                                 |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eWarningUnacked           | WARNING alarm unacknowledged                                                                |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eErrorUnacked             | ERROR alarm unacknowledged                                                                  |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eEmergencyUnacked         | EMERGENCY alarm unacknowledged                                                              |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eDisabled                 | Alarm is disabled                                                                           |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eSignalFault              | Signal has fault condition                                                                  |
    |                   |                             +-----------------------------+---------------------------------------------------------------------------------------------+
    |                   |                             | - eComponentSuspended       | Component is suspended                                                                      |
    +-------------------+-----------------------------+------------------------------------+--------------------------------------------------------------------------------------+
    | Event.timestamp   | string                      | Optional: time stamp, when this event was sent (in UTC nanotime)                                                          |
    +-------------------+-----------------------------+---------------------------------------------------------------------------------------------------------------------------+
    | Event.data        | string                      | Optional: name + value pairs                                                                                              |
    +-------------------+-----------------------------+---------------------------------------------------------------------------------------------------------------------------+

- Example

    .. code:: javascript

        node.subscribeToEvents(function (event) {
          console.log("Event triggered by:" + event.sender);
        });

node.unsubscribeFromEvent(eventConsumer)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    Function(event) eventConsumer

- Usage

    Unsubscribe given callback from events on this node.

node.addChild(name, typeName)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    name - Name for the new node

    typeName - Model name to be used for adding the new node

- Usage

    Add child Node to this Node.

node.removeChild(name)
^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    name - Name of the node to be removed

- Usage

    Remove child Node from this Node.

Logger Integration (CDP 5.1+)
-----------------------------

The CDP Logger client is bundled into ``cdp-client`` as ``studio.logger``. Logger
discovery and connection is handled automatically via the StudioAPI proxy — no need
to manually discover the logger port or manage a separate WebSocket connection.
For more information about CDP Logger, see https://cdpstudio.com/manual/cdp/cdplogger/cdplogger-index.html.
For background on the data query protocol, time synchronization, and API version
history, see `logger/DOCUMENTATION.md <https://github.com/CDPTechnologies/JavascriptCDPClient/blob/main/logger/DOCUMENTATION.md>`_. Runnable
examples are in `logger/examples/ <https://github.com/CDPTechnologies/JavascriptCDPClient/tree/main/logger/examples>`_.

Logger data is served behind StudioAPI authentication and tunneled through the
existing proxy connection.

client.logger(name, options)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    name (optional) - Logger service name (node path) to filter by, e.g. ``"App.CDPLogger"``

    options (optional) - ``{ timeout: number }`` Timeout in milliseconds. Rejects if no matching service appears in time.

- Returns

    Promise.<LoggerClient> - Resolves with a connected logger client instance.

- Usage

    Returns a logger client for querying historic data and events. The logger
    is discovered automatically from all applications in the system, including
    sibling apps connected via proxy. Without a timeout, waits indefinitely
    until a matching logger appears. Repeated calls return the same instance.

- Example

    .. code:: javascript

        const studio = require("cdp-client");
        const client = new studio.api.Client("127.0.0.1:7689");

        // Auto-discover any available logger
        client.logger().then(function(logger) {
          return logger.requestLogLimits().then(function(limits) {
            return logger.requestDataPoints(
              ["Temperature", "Pressure"],
              limits.startS, limits.endS, 200, 0
            );
          }).then(function(points) {
            points.forEach(function(p) {
              var temp = p.value["Temperature"];
              console.log(new Date(p.timestamp * 1000), "min:", temp.min, "max:", temp.max);
            });
          });
        });

    .. code:: javascript

        // Discover a specific logger by name
        client.logger("App.CDPLogger").then(function(logger) {
          return logger.requestLoggedNodes().then(function(nodes) {
            console.log("Logged nodes:", nodes.map(function(n) { return n.name; }));
          });
        });

    .. code:: javascript

        // Query events
        client.logger().then(function(logger) {
          return logger.requestEvents({
            limit: 100,
            flags: studio.logger.Client.EventQueryFlags.NewestFirst
          }).then(function(events) {
            events.forEach(function(e) {
              console.log(e.sender, e.data);
            });
          });
        });

    .. code:: javascript

        // With timeout — rejects if no logger found within 5 seconds
        client.logger("App.CDPLogger", { timeout: 5000 }).catch(function(err) {
          console.log(err); // "Timeout: no logger service found for 'App.CDPLogger'"
        });

client.loggers()
^^^^^^^^^^^^^^^^

- Returns

    Promise.<Array.<{name, metadata}>> - All available logger services. Waits for
    service discovery if none have been received yet.

- Usage

    Returns the list of all discovered logger services. Each entry has ``name``
    (the logger's node path) and ``metadata`` (service metadata including ``proxy_type``).

- Example

    .. code:: javascript

        client.loggers().then(function(loggers) {
          loggers.forEach(function(l) {
            console.log(l.name, l.metadata.proxy_type); // "App.CDPLogger" "logserver"
          });
        });

studio.logger.Client
~~~~~~~~~~~~~~~~~~~~

The logger client class is also available as ``studio.logger.Client`` for standalone
usage when the logger endpoint is already known.

Node.js
"""""""

In Node.js, the logger client is loaded automatically:

    .. code:: javascript

        const studio = require("cdp-client");
        var loggerClient = new studio.logger.Client("127.0.0.1:17000");

Browser
"""""""

In the browser, load the proto files and logger client before ``index.js``:

    .. code:: html

        <script src="protobuf.min.js"></script>
        <script src="logger/variant.proto.js"></script>
        <script src="logger/database.proto.js"></script>
        <script src="logger/container.proto.js"></script>
        <script src="logger/logger-client.js"></script>
        <script src="index.js"></script>

Then use via ``studio.logger.Client``:

    .. code:: javascript

        var loggerClient = new studio.logger.Client(window.location.hostname + ":17000");

Static properties:

- ``studio.logger.Client.EventQueryFlags`` - ``{ None: 0, NewestFirst: 1, TimeRangeBeginExclusive: 2, TimeRangeEndExclusive: 4, UseLogStampForTimeRange: 8 }``
- ``studio.logger.Client.MatchType`` - ``{ Exact: 0, Wildcard: 1 }``

LoggerClient API
~~~~~~~~~~~~~~~~

The logger client returned by ``client.logger()`` provides these methods:

- ``requestApiVersion()`` - Returns Promise with the logger API version string.
- ``requestLoggedNodes()`` - Returns Promise with array of ``{ name, routing, tags }`` for each logged signal.
- ``requestLogLimits()`` - Returns Promise with ``{ startS, endS }`` — the earliest and latest logged timestamps in seconds.
- ``requestDataPoints(nodeNames, startS, endS, noOfDataPoints, limit)`` - Returns Promise with array of data points. Each point has ``{ timestamp, value }`` where value maps signal names to ``{ min, max, last }``.
- ``requestEvents(query)`` - Returns Promise with array of events. Query supports ``limit``, ``offset``, ``flags``, ``timeRangeBegin``, ``timeRangeEnd``, ``codeMask``, ``senderConditions``, ``dataConditions``.
- ``countEvents(query)`` - Returns Promise with the count of matching events.
- ``getEventCodeDescription(code)`` - Returns human-readable description for an event code (e.g. ``"AlarmSet + SourceObjectUnavailable"``).
- ``getEventCodeString(code)`` - Returns compact event code string (e.g. ``"RepriseAlarmSet"``, ``"Ack"``).
- ``getSenderTags(sender)`` - Returns Promise with tags for an event sender.
- ``disconnect()`` - Closes the connection and disables auto-reconnect.
- ``setEnableTimeSync(enable)`` - Enable or disable automatic time synchronization with the server.

