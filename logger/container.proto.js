const containerProtoText = `
// This is the .proto file in Google Protocol Buffers format.
// When this file is compiled with Google Protocol Buffers compiler
// (https://code.google.com/p/protobuf/downloads/list), then Java/Python/C++
// code is generated which contains methods for serializing and deserializing
// the messages contained in this .proto file.

syntax = "proto2";

package DBMessaging.Protobuf;

option optimize_for = LITE_RUNTIME;
option java_package = "no.icd.dbmessaging.protobuf";

import "database.proto";

/** Common union-style base type for all Protobuf messages in DB. */
message Container {
  enum Type {
    eSignalInfoRequest = 1;
    eSignalInfoResponse = 2;
    eSignalDataRequest = 3;
    eSignalDataResponse = 4;
    eCriterionLimitsRequest = 5;
    eCriterionLimitsResponse = 6;
    eVersionRequest = 7;
    eVersionResponse = 8;
    eError = 9;
    eTimeRequest = 10;
    eTimeResponse = 11;
    eEventSenderTagsRequest = 12;
    eEventSenderTagsResponse = 13;
    eCountEventsRequest = 14;
    eCountEventsResponse = 15;
    eEventsRequest = 16;
    eEventsResponse = 17;
  }
  optional Type message_type = 1;
  optional SignalInfoRequest signal_info_request = 2;
  optional SignalInfoResponse signal_info_response = 3;
  optional SignalDataRequest signal_data_request = 4;
  optional SignalDataResponse signal_data_response = 5;
  optional CriterionLimitsRequest criterion_limits_request = 6;
  optional CriterionLimitsResponse criterion_limits_response = 7;
  optional VersionRequest version_request = 8;
  optional VersionResponse version_response = 9;
  optional Error error = 10;
  optional TimeRequest time_request = 11;
  optional TimeResponse time_response = 12;
  optional EventSenderTagsRequest event_sender_tags_request = 13;
  optional EventSenderTagsResponse event_sender_tags_response = 14;
  optional CountEventsRequest count_events_request = 15;
  optional CountEventsResponse count_events_response = 16;
  optional EventsRequest events_request = 17;
  optional EventsResponse events_response = 18;
  extensions 100 to max;
}
`;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = containerProtoText;
} else if (typeof window !== 'undefined') {
  window.containerProto = containerProtoText;
}
