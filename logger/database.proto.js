const databaseProtoText = `
// This is the .proto file in Google Protocol Buffers format.
// When this file is compiled with Google Protocol Buffers compiler
// (https://code.google.com/p/protobuf/downloads/list), then Java/Python/C++
// code is generated which contains methods for serializing and deserializing
// the messages contained in this .proto file.

syntax = "proto2";

package DBMessaging.Protobuf;

option optimize_for = LITE_RUNTIME;
option java_package = "no.icd.dbmessaging.protobuf";

import "variant.proto";

// Signal queries

message SignalInfoRequest {
  optional uint32 request_id = 1;
}

message SignalInfoResponse {
  optional uint32 request_id = 1;
  repeated string name = 2;
  repeated uint32 id = 3;
  repeated ICD.Protobuf.CDPValueType type = 4;
  repeated string path = 5;
  repeated TagMap tagMap = 6;
}

message TagInfo {
  optional string value = 1;
  optional string source = 2;
}

message TagMap {
  map<string, TagInfo> tags = 1;
}

message SignalDataRequest {
  optional uint32 request_id = 1;
  repeated uint32 signal_id = 2;
  optional double criterion_min = 3;
  optional double criterion_max = 4;
  optional uint32 num_of_datapoints = 5; // requested resolution
  optional uint32 limit = 6; // Return the first 'n' rows of the query result
}

message SignalDataResponse {
  optional uint32 request_id = 1;  // corresponds to SignalDataRequest::request_id
  repeated double criterion = 2;
  repeated SignalDataRow row = 3;
}

message SignalDataRow {
  repeated uint32 signal_id = 1;
  repeated ICD.Protobuf.VariantValue min_values = 2;
  repeated ICD.Protobuf.VariantValue max_values = 3;
  repeated ICD.Protobuf.VariantValue last_values = 4;
}

message CriterionLimitsRequest {
  optional uint32 request_id = 1;
}

message CriterionLimitsResponse {
  optional uint32 request_id = 1;  // corresponds to CriterionLimitsRequest::request_id
  optional double criterion_min = 2;
  optional double criterion_max = 3;
}

// Event queries

message Event {
  optional string sender = 1;
  map<string, string> data = 2;
  optional double timestamp_sec = 3;
  optional uint64 id = 4;
  optional uint32 code = 5;
  optional uint32 status = 6;
  optional double logstamp_sec = 7;
}

message EventQuery {
  enum MatchType {
    Exact = 0;
    Wildcard = 1;
  }

  message Condition {
    optional string value = 1;
    optional MatchType type = 2;
  }

  message ConditionList {
    repeated Condition conditions = 1;
  }

  optional double time_range_begin = 1;
  optional double time_range_end = 2;
  optional uint32 code_mask = 3;
  optional uint32 limit = 4;
  optional uint32 offset = 5;
  optional uint32 flags = 6;
  optional ConditionList sender_conditions = 7;
  map<string, ConditionList> data_conditions = 8;
}

message EventSenderTagsRequest {
  optional uint32 request_id = 1;
}

message EventSenderTagsResponse {
  optional uint32 request_id = 1;
  map<string, TagMap> sender_tags = 2;
}

message CountEventsRequest {
  optional uint32 request_id = 1;
  optional EventQuery query = 2;
}

message CountEventsResponse {
  optional uint32 request_id = 1;
  optional int64 count = 2;
}

message EventsRequest {
  optional uint32 request_id = 1;
  optional EventQuery query = 2;
}

message EventsResponse {
  optional uint32 request_id = 1;
  repeated Event events = 2;
}

// Server info queries

message VersionRequest {
  optional uint32 request_id = 1;
}

message VersionResponse {
  optional uint32 request_id = 1;
  optional string version = 2;
}

message Error {
  optional uint32 request_id = 1;
  optional string errorMessage = 2;
  optional int32 errorCode = 3;
}

message TimeRequest {
  optional uint32 request_id = 1;
}

message TimeResponse {
  optional uint32 request_id = 1;
  optional fixed64 timestamp = 2;  // nanoseconds
}
`;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = databaseProtoText;
} else if (typeof window !== 'undefined') {
  window.databaseProto = databaseProtoText;
}
