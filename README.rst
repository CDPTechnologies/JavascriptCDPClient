CDP Client
==========

A simple Javascript interface for the CDP Studio development platform that allows Javascript applications to interact with
CDP Applications - retrieve CDP Application structures and read-write object values. For more information
about CDP Studio see https://cdpstudio.com/.

Installation
------------

::

    $ npm install cdp-client

API
---

Each node in public CDP Application structure tree is represented by INode object in the API.
INode object may have an a value depending on the kind of CDP object it reflects and it
may also have other INode objects as children.

Before all examples, you need:

    .. code:: javascript

        import studio from "cdp-client"
    
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


studio.api.Client(uri, notificationListener)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    uri - String containing the address and port of StudioAPI server separated by colon character

    notificationListener - Object returning two functions: applicationAcceptanceRequested(studio.api.Request) and credentialsRequested(studio.api.Request). 
      Function applicationAcceptanceRequested must return a Promise of void. Can be used to popup system use notification message and ask for confirmation to continue.
      Function credentialsRequested must return a Promise of dictionary containing 'Username' and 'Password' as keys for authentication.

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
              if (request.userAuthResult().code() == studio.api.CREDENTIALS_REQUIRED) {
                // Do something to gather username and password variables (either sync or async way) and then call:
                resolve({Username: "cdpuser", Password: "cdpuser"});
              }
              if (request.userAuthResult().code() == studio.api.REAUTHENTICATIONREQUIRED) {
                // Pop user a message that idle lockout was happened and server requires new authentication to continue:
                resolve({Username: "cdpuser", Password: "cdpuser"});
              }
            });
          }
        }

        var client = new studio.api.Client(window.location.host, new NotificationListener());


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

client.find(path)
^^^^^^^^^^^^^^^^^

- Arguments

    path - Path of the object to look for.

- Returns

    Promise containing requested INode object when fulfilled.
    
- Restriction

    The requested node must reside in the application client was connected to.

- Usage

    The provided path must contain dot separated path to target node. **Root node is not considered part of the path.**

- Example

    .. code:: javascript

        client.find("MyApp.CPULoad").then(function (load) {
          // use the load object referring to CPULoad in MyApp
        });
        
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
    | Info.node_id     | number                       | Application wide unique ID for each instance in CDP structure |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.name        | string                       | Nodes short name                                              |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.node_type   | studio.protocol.CDPNodeType  | Direct CDP base type of the class. One of the following:      |
    |                  |                              | CDP_UNDEFINED                                                 |
    |                  |                              | CDP_APPLICATION                                               |
    |                  |                              | CDP_COMPONENT                                                 |
    |                  |                              | CDP_OBJECT                                                    |
    |                  |                              | CDP_MESSAGE                                                   |
    |                  |                              | CDP_BASE_OBJECT                                               |
    |                  |                              | CDP_PROPERTY                                                  |
    |                  |                              | CDP_SETTING                                                   |
    |                  |                              | CDP_ENUM                                                      |
    |                  |                              | CDP_OPERATOR                                                  |
    |                  |                              | CDP_NODE                                                      |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.value_type  | studio.protocol.CDPValueType | Optional: Value primitive type the node holds                 |
    |                  |                              | if node may hold a value. One of the following:               |
    |                  |                              | eUNDEFINED                                                    |
    |                  |                              | eDOUBLE                                                       |
    |                  |                              | eUINT64                                                       |
    |                  |                              | eINT64                                                        |
    |                  |                              | eFLOAT                                                        |
    |                  |                              | eUINT                                                         |
    |                  |                              | eINT                                                          |
    |                  |                              | eUSHORT                                                       |
    |                  |                              | eSHORT                                                        |
    |                  |                              | eUCHAR                                                        |
    |                  |                              | eCHAR                                                         |
    |                  |                              | eBOOL                                                         |
    |                  |                              | eSTRING                                                       |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.type_name   | string                       | Optional: Class name of the reflected node                    |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.server_addr | string                       | Optional: StudioAPI IP present on application nodes that      |
    |                  |                              | have **Info.is_local == false**                               |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.server_port | number                       | Optional: StudioAPI Port present on application nodes that    |
    |                  |                              | have **Info.is_local == false**                               |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.is_local    | boolean                      | Optional: When multiple applications are present in root node |
    |                  |                              | this flag is set to true for the application that the client  |
    |                  |                              | is connected to                                               |
    +------------------+------------------------------+---------------------------------------------------------------+
    | Info.flags       | studio.protocol.Info.Flags   | Optional: Node flags. Any of:                                 |
    |                  |                              | eNone                                                         |
    |                  |                              | eNodeIsLeaf                                                   |
    |                  |                              | eValueIsPersistent                                            |
    |                  |                              | eValueIsReadOnly                                              |
    |                  |                              | eNodeIsRemovable                                              |
    |                  |                              | eNodeCanAddChildren                                           |
    |                  |                              | eNodeIsRenamable                                              |
    |                  |                              | eNodeIsInternal                                               |
    |                  |                              | eNodeIsImportant                                              |
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
          if (child.info().node_type == studio.protocol.CDPNodeType.CDP_COMPONENT) {
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
    with value of the nodes value_type and UTC Unix timestamp in nanoseconds (nanoseconds from 01.01.1970).
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

    Subscribe to structure changes on this node. Each time child is added or removed from current node
    structureConsumer function is called with the name of the node and change argument where ADD == 1 and REMOVE == 0.

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

    +-------------------+----------------------------------+---------------------------------------------------------------------------------------------------------------------------------+
    | Property          | Type                             | Description                                                                                                                     |
    +===================+==================================+=================================================================================================================================+
    | Event.id          | number                           | Optional: System unique eventId (CDP eventId + handle)                                                                          |
    +-------------------+----------------------------------+---------------------------------------------------------------------------------------------------------------------------------+
    | Event.sender      | string                           | Optional: Event sender full name                                                                                                |
    +-------------------+----------------------------------+---------------------------------------------------------------------------------------------------------------------------------+
    | Event.flags       | studio.protocol.EventCodeFlags   | Optional: Event code flags. Any of:                                                                                             |
    |                   |                                  | eAlarmSet = 1;                  // The alarm's Set flag/state was set. The alarm changed state to "Unack-Set"                   |
    |                   |                                  | eAlarmClr = 2;                  // The alarm's Set flag was cleared. The Unack state is unchanged.                              |
    |                   |                                  | eAlarmAck = 4;                  // The alarm changed state from "Unacknowledged" to "Acknowledged". The Set state is unchanged. |
    |                   |                                  | eReprise = 64;                  // A repetition/update of an event that has been reported before. Courtesy of late subscribers. |
    |                   |                                  | eSourceObjectUnavailable = 256; // The provider of the event has become unavailable. (disconnected or similar)                  |
    |                   |                                  | eNodeBoot = 1073741824;         // The provider reports that the CDPEventNode just have booted.                                 |
    +-------------------+----------------------------------+---------------------------------------------------------------------------------------------------------------------------------+
    | Event.status      | studio.protocol.EventStatusFlags | Optional: Value primitive type the node holds if node may hold a value. Any of:                                                 |
    |                   |                                  | eStatusOK = 0x0,                 // No alarm set                                                                                |
    |                   |                                  | eNotifySet = 0x1,                // NOTIFY alarm set                                                                            |
    |                   |                                  | eWarningSet = 0x10,              // WARNING alarm set                                                                           |
    |                   |                                  | eLowLevelSet = 0x20,             // LOW LEVEL alarm set                                                                         |
    |                   |                                  | eHighLevelSet = 0x40,            // HIGH LEVEL alarm set                                                                        |
    |                   |                                  | eErrorSet = 0x100,               // ERROR alarm set                                                                             |
    |                   |                                  | eLowLowLevelSet = 0x200,         // LOW-LOW LEVEL alarm set                                                                     |
    |                   |                                  | eHighHighLevelSet = 0x400,       // HIGH-HIGH LEVEL alarm set                                                                   |
    |                   |                                  | eEmergencySet = 0x800,           // EMERGENCY LEVEL alarm present                                                               |
    |                   |                                  | eValueForced = 0x1000,           // Signal value was forced (overridden)                                                        |
    |                   |                                  | eRepeatBlocked = 0x2000,         // Alarm is blocked due to too many repeats                                                    |
    |                   |                                  | eProcessBlocked = 0x4000,        // Alarm is blocked by the software                                                            |
    |                   |                                  | eOperatorBlocked = 0x8000,       // Alarm is blocked by the user                                                                |
    |                   |                                  | eNotifyUnacked = 0x10000,        // NOTIFY alarm unacknowledged                                                                 |
    |                   |                                  | eWarningUnacked = 0x100000,      // WARNING alarm unacknowledged                                                                |
    |                   |                                  | eErrorUnacked = 0x1000000,       // ERROR alarm unacknowledged                                                                  |
    |                   |                                  | eEmergencyUnacked = 0x8000000,   // EMERGENCY alarm unacknowledged                                                              |
    |                   |                                  | eDisabled = 0x20000000,          // Alarm is disabled                                                                           |
    |                   |                                  | eSignalFault = 0x40000000,       // Signal has fault condition                                                                  |
    |                   |                                  | eComponentSuspended = 0x80000000 // Component is suspended                                                                      |
    +-------------------+----------------------------------+---------------------------------------------------------------------------------------------------------------------------------+
    | Event.timestamp   | string                           | Optional: time stamp, when this event was sent (in UTC nanotime)                                                                |
    +-------------------+----------------------------------+---------------------------------------------------------------------------------------------------------------------------------+
    | Event.data        | string                           | Optional: name + value pairs                                                                                                    |
    +-------------------+----------------------------------+---------------------------------------------------------------------------------------------------------------------------------+

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

