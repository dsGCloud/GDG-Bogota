/**
 * Copyright 2016, Google, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';
// a configuration file defining the pubsub topics and BigQuery details
const config = require('./config.js');

// Get a reference to the Cloud Storage component
const storage = require('@google-cloud/storage')();
// Get a reference to the Pub/Sub component
const pubsub = require('@google-cloud/pubsub')();
// Get a reference to the Cloud Vision API component
const vision = require('@google-cloud/vision')();
// Get a reference to the Cloud Video Intelligence API component
const video = require('@google-cloud/video-intelligence')();
// Get a reference to the BigQuery API component
const bigquery = require('@google-cloud/bigquery')();

const Buffer = require('safe-buffer').Buffer;
const videoSafeSearchMap = [ "UNKNOWN","VERY_UNLIKELY","UNLIKELY","POSSIBLE","LIKELY","VERY_LIKELY"];

// [START functions_insertIntoBigQuery]
/**
 * Function called with a request to insert a row into BigQuery
 *
 * @param {object} event The Cloud Functions event which contains a BigQuery insert request object specifying 1 row
 */

exports.insertIntoBigQuery = function insertIntoBigQuery(event){

  const reqData = Buffer.from(event.data.data, 'base64').toString();
  const reqDataObj = JSON.parse(reqData);
  console.info(reqDataObj);

  return Promise.resolve()
    .then(() => {

      if ((typeof(reqDataObj.gcsUrl) === "undefined") || (!reqDataObj.gcsUrl)) {
        console.error(`Input request: ${reqData}`);
        throw new Error('GCSUrl not provided. Make sure you have a "gcsUrl" property in your request');
      }

      if ((typeof(reqDataObj.contentUrl) === "undefined") || (!reqDataObj.contentUrl)) {
        console.error(`Input request: ${reqData}`);
        throw new Error('ContentUrl not provided. Make sure you have a "contentUrl" property in your request');
      }
      if ((typeof(reqDataObj.contentType) === "undefined") || (!reqDataObj.contentType)) {
        console.error(`Input request: ${reqData}`);
        throw new Error('ContentType not provided. Make sure you have a "contentType" property in your request');
      }
      if ((reqDataObj.contentType.search(/video/i) == -1) && (reqDataObj.contentType.search(/image/i) == -1)) {
        console.error(`Unsupported ContentType provided. Make sure you upload an image or video which includes a "contentType" property of image or video in your request`);
        throw new Error('Unsupported ContentType provided. Make sure you upload an image or video which includes a "contentType" property of image or video in your request');
      }
      if ((typeof(reqDataObj.insertTimestamp) === "undefined") ||  (!reqDataObj.insertTimestamp)) {
        console.error(`Input request: ${reqData}`);
        throw new Error('insertTimestamp not provided. Make sure you have a "insertTimestamp" property in your request');
      }

      console.log(`Sending BigQuery insert request`);
      const bqDataset = bigquery.dataset(config.DATASET_ID);
      const bqTable = bqDataset.table(config.TABLE_NAME);

      return bqTable.insert(reqDataObj);
    })
    .then(function(data) {
      const apiResponse = data[0];
      console.log('Inserted the record into BigQuery');
      console.info(apiResponse);
    })
    .then(() => {
      console.log(`Insert request complete`);
    });
};
// [END functions_insertIntoBigQuery]