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

        import studio from cdp_client
    
Global API
~~~~~~~~~~

studio.api.AuthRequest(userID, password)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    userID - User id to authenticate.

    password - Password to use for login.

- Returns

    The created AuthRequest object with provided login data.


studio.api.Client(uri)
^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    uri - String containing the address and port of StudioAPI server separated by colon character

    authenticate - Function authenticate(lastAttemptMessage) returning a Promise.<AuthRequest> containing userID and password for authentication

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

        // Create client with authentication connected to uri provided in browser address bar.
        // The authenticator is only called when page requires a login.
        var authenticator =  function(loginMessage) {
            return new Promise(function(resolve, reject) {
              //Do something to get username and password variables
              resolve(new studio.api.AuthRequest(username, password));
            });
        };
        var client = new studio.api.Client(window.location.host, authenticator);


Instance Methods / Client
~~~~~~~~~~~~~~~~~~~~~~~~~

client.root()
^^^^^^^^^^^^^

- Returns

    Promise containing root INode object when fulfilled.

- Usage

    Wait for root INode object to be available from connected application. The root node is
    the top-level "system" node that contains the application connected to as local application and
    information about other applications visible on the network.
    
- Example

    .. code:: javascript

        client.root().then(function (system) {
          // use the system INode object to access connected structure.
        }

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
        }
        
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
    | Info.flags       | studio.protocol.Info.Flags   | Optional: Optional: Node flags. Any of:                       |
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
        }
        
node.subscribeToValues(valueConsumer)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    Function(value, timestamp) valueConsumer - timestamp in nanoseconds since EPOCH presented as long int

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


node.subscribeToChildValues(name, valueConsumer)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Arguments

    name
    
    Function(value, timestamp) valueConsumer - timestamp in nanoseconds since EPOCH presented as long int

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

