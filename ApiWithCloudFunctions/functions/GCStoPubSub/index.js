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

// [START functions_publishResult]
/**
 * Publishes the result to the given pubsub topic and returns a Promise.
 *
 * @param {string} topicName Name of the topic on which to publish.
 * @param {object} data The message data to publish.
 */
function publishResult (topicName, data) {
  return pubsub.topic(topicName).get({ autoCreate: true })
    .then(([topic]) => topic.publish(data));
}
// [END functions_publishResult]

// [START functions_GCStoPubsub]
/**
 * Background Cloud Function to be triggered by Cloud Storage.
 *
 * @param {object} event The Cloud Functions event which contains a pubsub message
 */
exports.GCStoPubsub = function GCStoPubsub (event) {
  const eventData = event.data;
  const jsonData = Buffer.from(eventData.data, 'base64').toString();

  var jsonObj = JSON.parse(jsonData);

  return Promise.resolve()
    .then(() => {

      if ((typeof(jsonObj.bucket) === "undefined") || (!jsonObj.bucket)) {
        console.error(`Input request: ${jsonData}`);
        throw new Error('Bucket not provided. Make sure you have a "bucket" property in your request');
      }
      if ((typeof(jsonObj.name) === "undefined") ||  (!jsonObj.name)) {
        console.error(`Input request: ${jsonData}`);
        throw new Error('Filename not provided. Make sure you have a "name" property in your request');
      }
      if ((typeof(jsonObj.contentType) === "undefined") || (!jsonObj.contentType)) {
        console.error(`Input request: ${jsonData}`);
        throw new Error('ContentType not provided. Make sure you have a "contentType" property in your request');
      }
      if ((jsonObj.contentType.search(/video/i) == -1) && (jsonObj.contentType.search(/image/i) == -1)) {
        console.error(`Input request: ${jsonData}`);
        throw new Error('Unsupported ContentType provided. Make sure you upload an image or video which includes a "contentType" property of image or video in your request');
      }

      console.log(`Received name: ${jsonObj.name} and bucket: ${jsonObj.bucket} and contentType: ${jsonObj.contentType}`);

      //move the current file to the results bucket
      return moveFile(jsonObj.bucket,jsonObj.name,config.RESULT_BUCKET,jsonObj.name)
      .then(() => {
          console.info("Completed file move");
      });
    })
    .then(() => {

      // build a msg for pubsub
      const msgData = {
        contentType : jsonObj.contentType,
        gcsUrl : "gs://"+config.RESULT_BUCKET+"/"+jsonObj.name,
        gcsBucket : config.RESULT_BUCKET,
        gcsFile : jsonObj.name
      };

      if (jsonObj.contentType) {
        // if we have an image, call the Vision API
        // if we have a video, call the Video Intelligence API
        if (jsonObj.contentType.search(/image/i) > -1) {
          console.info(`Vision API request ${JSON.stringify(msgData)}`);
          console.log(`Sending Vision API request`);
          return publishResult(config.VISION_TOPIC,msgData);
        } else
        if (jsonObj.contentType.search(/video/i) > -1) {
          console.info(`Sending Video Intelligence API request ${JSON.stringify(msgData)}`);
          console.log(`Sending Video Intelligence API request`);
          return publishResult(config.VIDEOINTELLIGENCE_TOPIC,msgData);
        } else {
          console.error('Incorrect file type: Received contentType '+jsonObj.contentType+' which is not an image or video file');
          throw new Error('Unsupported ContentType provided. Make sure you include a "contentType" property of image or video in your request');
        }

      } else {
        console.error('No file type: Received contentType '+jsonObj.contentType+' which is not an image or video file');
        throw new Error('ContentType not provided. Make sure you have a "contentType" property in your request');
      }

    })
    .then(() => {

      console.log(`File ${jsonObj.name} processed.`);

    });
};
// [END functions_GCStoPubsub]

/**
 * Function to move a file from 1 GCS bucket to another
 *
 * @param {String} srcBucket The name of the source bucket
 * @param {String} srcFile The name of the source file
 * @param {String} destBucket The name of the destination bucket
 * @param {String} destFile The name of the destination file
 */
function moveFile(srcBucket, srcFile, destBucket, destFile) {
    const newFileLoc = "gs://"+destBucket+"/"+destFile;
    return storage.bucket(srcBucket).file(srcFile).move(newFileLoc)
    .then(() => {
      console.log("gs://"+srcBucket+"/"+srcFile +" moved to gs://"+destBucket+"/"+destFile);
    });


}
