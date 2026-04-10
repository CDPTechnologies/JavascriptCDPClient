const variantProtoText = `
// This is the .proto file in Google Protocol Buffers format.
// When this file is compiled with Google Protocol Buffers compiler
// (https://code.google.com/p/protobuf/downloads/list), then Java/Python/C++
// code is generated which contains methods for serializing and deserializing
// the messages contained in this .proto file.

syntax = "proto2";

package ICD.Protobuf;

option optimize_for = LITE_RUNTIME;
option java_package = "no.icd.dbmessaging";

/** CDP value type identifier. */
enum CDPValueType {
  eUNDEFINED = 0;
  eDOUBLE = 1;
  eUINT64 = 2;
  eINT64 = 3;
  eFLOAT = 4;
  eUINT = 5;
  eINT = 6;
  eUSHORT = 7;
  eSHORT = 8;
  eUCHAR = 9;
  eCHAR = 10;
  eBOOL = 11;
  eSTRING = 12;
  eUSERTYPE = 100;
}

/** Common Variant value type for a remote node. */
message VariantValue {
  optional uint32 node_id = 1;
  optional double d_value = 2;
  optional float f_value = 3;
  optional uint64 ui64_value = 4;
  optional sint64 i64_value = 5;
  optional uint32 ui_value = 6;
  optional sint32 i_value = 7;
  optional uint32 us_value = 8;  // uint used as ushort (which protobuf doesnt have)
  optional sint32 s_value = 9;   // int used as short
  optional uint32 uc_value = 10; // uint used as uchar
  optional sint32 c_value = 11;  // int used as char
  optional bool b_value = 12;
  optional string str_value = 13;
  optional double timestamp = 14; // Source may provide timestamp for sent value
  extensions 100 to max;
}
`;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = variantProtoText;
} else if (typeof window !== 'undefined') {
  window.variantProto = variantProtoText;
}
