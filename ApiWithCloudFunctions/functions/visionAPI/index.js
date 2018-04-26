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

// [START functions_visionAPI]
/**
 * Function to run a file through the Vision API and insert the results in BigQuery
 *
 * @param {object} event The Cloud Functions event which contains a message with the GCS file details
 */
exports.visionAPI = function visionAPI (event) {
  const reqData = Buffer.from(event.data.data, 'base64').toString();
  const reqDataObj = JSON.parse(reqData);
  console.info(reqData);
  var bqInsertObj = {};

  return Promise.resolve()
    .then(() => {

      if ((typeof(reqDataObj.gcsBucket) === "undefined") || (!reqDataObj.gcsBucket)) {
        console.error(`Input request: ${reqData}`);
        throw new Error('Bucket not provided. Make sure you have a "gcsBucket" property in your request');
      }
      if ((typeof(reqDataObj.gcsFile) === "undefined") ||  (!reqDataObj.gcsFile)) {
        console.error(`Input request: ${reqData}`);
        throw new Error('Filename not provided. Make sure you have a "gcsFile" property in your request');
      }
      if ((typeof(reqDataObj.contentType) === "undefined") || (!reqDataObj.contentType)) {
        console.error(`Input request: ${reqData}`);
        throw new Error('ContentType not provided. Make sure you have a "contentType" property in your request');
      }
      if ((typeof(reqDataObj.gcsUrl) === "undefined") || (!reqDataObj.gcsUrl)) {
        console.error(`Input request: ${reqData}`);
        throw new Error('GCS URL not provided. Make sure you have a "gcsUrl" property in your request');
      }
      if ((reqDataObj.contentType.search(/video/i) == -1) && (reqDataObj.contentType.search(/image/i) == -1)) {
        console.error(`Unsupported ContentType provided. Make sure you upload an image or video which includes a "contentType" property of image or video in your request`);
        throw new Error('Unsupported ContentType provided. Make sure you upload an image or video which includes a "contentType" property of image or video in your request');
      }


      console.log(`Received name: ${reqDataObj.gcsFile} and bucket: ${reqDataObj.gcsBucket} and contentType: ${reqDataObj.contentType}`);

      bqInsertObj.gcsUrl = reqDataObj.gcsUrl;
      bqInsertObj.contentUrl = config.GCS_AUTH_BROWSER_URL_BASE + reqDataObj.gcsBucket +"/"+reqDataObj.gcsFile;
      bqInsertObj.contentType = reqDataObj.contentType;
      bqInsertObj.insertTimestamp = Math.round(Date.now()/1000).toString();

      var features = [
        { "type" : "LOGO_DETECTION"},
        { "type" : "LABEL_DETECTION"},
        { "type" : "LANDMARK_DETECTION"},
        { "type" : "SAFE_SEARCH_DETECTION"}
      ];

      var request = {
        image : { source: { imageUri: reqDataObj.gcsUrl }},
        features
      };

      console.info(`Vision request: ${JSON.stringify(request)}`);
      console.log(`Sending vision request`);
      return vision.annotateImage(request);
    })
    .then((results) => {
      const annotatedResponse = results[0];
      const logos = annotatedResponse.logoAnnotations;
      const labels = annotatedResponse.labelAnnotations;
      const safeSearch = annotatedResponse.safeSearchAnnotation;
      const error = annotatedResponse.error;
      console.info(`Received vision response ${JSON.stringify(results)}`);

      if (error!==null) {
        console.info("Error not null");
        console.error(`Error from Vision API: code:${error.code}, message: ${error.message} processing file ${reqDataObj.gcsUrl}`);
        throw new Error(`From Vision API: code:${error.code}, message: ${error.message} processing file ${reqDataObj.gcsUrl}`);
      }

      if (labels.length>0 ){
        bqInsertObj.labels = [];
        labels.forEach(function(label) {
            bqInsertObj = addALabel(label.description, bqInsertObj);
        });
      }

      bqInsertObj.safeSearch = [];
      bqInsertObj=addSafeSearchResults(config.API_Constants.ADULT,safeSearch.adult, bqInsertObj);
      bqInsertObj=addSafeSearchResults(config.API_Constants.SPOOF,safeSearch.spoof, bqInsertObj);
      bqInsertObj=addSafeSearchResults(config.API_Constants.MEDICAL,safeSearch.medical, bqInsertObj);
      bqInsertObj=addSafeSearchResults(config.API_Constants.VIOLENCE,safeSearch.violence, bqInsertObj);


      // check to see if any of the SafeSearch results came back with POSSIBLE, LIKELY, or VERY_LIKELY
      if (checkForSafeSearchLiklihood(safeSearch)){
         // move the file and update the Uri and Url
        moveFile(reqDataObj.gcsBucket,reqDataObj.gcsFile,config.REJECTED_BUCKET,reqDataObj.gcsFile);
        bqInsertObj.gcsUrl = "gs://"+config.REJECTED_BUCKET+"/"+reqDataObj.gcsFile;
        bqInsertObj.contentUrl = config.GCS_AUTH_BROWSER_URL_BASE + config.REJECTED_BUCKET +"/"+reqDataObj.gcsFile;
      }

      if (logos.length>0){
          if ( !bqInsertObj.labels ){
                bqInsertObj.labels = [];
          }

        logos.forEach(function(logo) {
          bqInsertObj = addALabel(logo.description, bqInsertObj);
        });
      }

      console.info(`bqInsertObj: ${JSON.stringify(bqInsertObj)}`);
      return publishResult(config.BIGQUERY_TOPIC,bqInsertObj);


    })
    .then(() => {

       console.log(`File ${reqDataObj.gcsFile} processed.`);

    });
};
// [END functions_visionAPI]

/**
 * Function to add a label to the request object
 *
 * @param {String} label The String label to add to the request
 * @param {object} requestObj The BigQuery request object
 */
function addALabel(label,requestObj) {
  var nameObj = {};
  nameObj.name = label;
  requestObj.labels.push(nameObj);
  return requestObj;
}

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

/**
 * Function to add SafeSearchResults to the request object
 *
 * @param {String} safeSearchType The String name of the safeSearch result to add to the request
 * @param {object} bqInsertObj The current request object to which to add the safeSearch result
 */
function addSafeSearchResults(safeSearchType, safeSearchVal, bqInsertObj){

    var flaggedTypeObj = {};
    flaggedTypeObj.flaggedType=safeSearchType;
    flaggedTypeObj.likelihood=safeSearchVal;
    bqInsertObj.safeSearch.push(flaggedTypeObj);
    return bqInsertObj;

}

/**
 * Checks whether any of the SafeSearch values are set and returns true if so, otherwise false
 *
 * @param {Object} safeSearch The SafeSearch object from the Vision API
 */
function checkForSafeSearchLiklihood(safeSearch){
  if (checkSafeSearchLikelihood(safeSearch.adult)) return true;
  if (checkSafeSearchLikelihood(safeSearch.medical)) return true;
  if (checkSafeSearchLikelihood(safeSearch.violence)) return true;
  if (checkSafeSearchLikelihood(safeSearch.spoof)) return true;
}

/**
 * Checks whether the SafeSearch value is POSSIBLE, LIKELY, OR VERY_LIKELY and returns true if so, otherwise false
 *
 * @param {String} safeSearchResult The String value to be evaluated
 */
function checkSafeSearchLikelihood(safeSearchResult) {
  if ((safeSearchResult == "POSSIBLE") || (safeSearchResult == "LIKELY") || (safeSearchResult == "VERY_LIKELY")) {
    return true;
  } else {
    return false;
  }
}

/**
 * Checks whether the SafeSearch value is POSSIBLE, LIKELY, OR VERY_LIKELY and returns true if so, otherwise false
 *
 * See the Video Intelligence proto on github for the details of the values
 * https://github.com/googleapis/googleapis/blob/master/google/cloud/videointelligence/v1beta1/video_intelligence.proto
 *
 * @param {int} safeSearchResult The int value to be evaluated
 */

function checkVideoSafeSearchLikelihood(safeSearchResult){
  if ((safeSearchResult == 3) || (safeSearchResult == 4) || (safeSearchResult == 5)) {
    return true;
  } else {
    return false;
  }

}