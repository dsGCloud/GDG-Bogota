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
const config = require('./config.json');

// Get a reference to the Cloud Storage component
const storage = require('@google-cloud/storage')();
// Get a reference to the Pub/Sub component
const pubsub = require('@google-cloud/pubsub')();
// Get a reference to the Cloud Vision API component
const vision = require('@google-cloud/vision')();
// Get a reference to the Cloud Video Intelligence API component
const video = require('@google-cloud/video-intelligence')();

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

// [START functions_videoIntelligenceAPI]
/**
 * Function to run a file through the Video Intelligence API and insert the results in BigQuery
 *
 * All SafeSearch annotations are aggregated and the highest rating for each 5 categories is returned.
 * i.e. if there are 3 sets of SafeSearch results and 1/3 indicates config.API_Constants.SPOOF is "VERT_LIKELY" while
 * the other 2 results indicate config.API_Constants.SPOOF as "UNKNOWN", config.API_Constants.SPOOF will be flagged as "VERY_LIKELY" for the video
 *
 * * @param {object} event The Cloud Functions event which contains a message with the GCS file details
 */
exports.videoIntelligenceAPI = function videoIntelligenceAPI (event)
{
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

      bqInsertObj.gcsUrl = reqDataObj.gcsUrl;
      bqInsertObj.contentUrl = config.GCS_AUTH_BROWSER_URL_BASE + reqDataObj.gcsBucket +"/"+reqDataObj.gcsFile;
      bqInsertObj.contentType = reqDataObj.contentType;
      bqInsertObj.insertTimestamp = Math.round(Date.now()/1000).toString();

      console.log(`Received name: ${reqDataObj.gcsFile} and bucket: ${reqDataObj.gcsBucket} and contentType: ${reqDataObj.contentType}`);

      // Construct request
      const request = {
        inputUri: reqDataObj.gcsUrl,
        features: ['LABEL_DETECTION','EXPLICIT_CONTENT_DETECTION']
      };
      console.log(`Sending video intelligence request`);
      console.info(`Sending video intelligence request: ${JSON.stringify(request)}`);

      // Execute request
      return video.annotateVideo(request);
    })
    .then((results) => {
      const operation = results[0];
      console.log('Waiting for operation to complete... (this may take a few minutes)');
      return operation.promise();
    })
    .then((results) => {

      // Gets annotations for video
      const annotations = results[0].annotationResults[0];

      // update for https://cloud.google.com/video-intelligence/docs/release-notes
      console.log(`Received video intelligence response`);
      console.info(`Received video intelligence response: ${JSON.stringify(results)}`);


      const safeSearchAnnotations = annotations.explicitAnnotation;
      var safeSearchFlag=false;
      var safeSearchAggregator = [];
      safeSearchAggregator[config.API_Constants.ADULT]=0;
      bqInsertObj.safeSearch = [];

      // get the explicitAnnotations from the Video Intelligence API results
      if ((typeof(safeSearchAnnotations) === "undefined") || (!safeSearchAnnotations)) {
        console.error(`No explicitAnnotation included in response: ${JSON.stringify(safeSearchAnnotations)}`);
      } else
      if ((typeof(safeSearchAnnotations.frames) === "undefined") || (!safeSearchAnnotations.frames)) {
        console.error(`No explicitAnnotation.frames included in response: ${JSON.stringify(safeSearchAnnotations)}`);
      } else
      if (safeSearchAnnotations.frames.length>0) {
        safeSearchAnnotations.frames.forEach((safeSearchAnnotation) => {

          if (safeSearchAnnotation.pornographyLikelihood > safeSearchAggregator[config.API_Constants.ADULT]){
            safeSearchAggregator[config.API_Constants.ADULT]=safeSearchAnnotation.pornographyLikelihood;
          }

          if (!safeSearchFlag) {
            safeSearchFlag = checkVideoForSafeSearchLiklihood(safeSearchAnnotation);
          }

        });

        // check to see if any of the SafeSearch results were flagged and if so, move the file to a different GCS location
        if (safeSearchFlag){

          // move the file and update the Uri and Url
          moveFile(reqDataObj.gcsBucket,reqDataObj.gcsFile,config.REJECTED_BUCKET,reqDataObj.gcsFile);
          bqInsertObj.gcsUrl = "gs://"+config.REJECTED_BUCKET+"/"+reqDataObj.gcsFile;
          bqInsertObj.contentUrl = config.GCS_AUTH_BROWSER_URL_BASE + config.REJECTED_BUCKET +"/"+reqDataObj.gcsFile;
        }

      }

      // add the explicitAnnotation results
      bqInsertObj=addSafeSearchResults(config.API_Constants.ADULT,videoSafeSearchMap[safeSearchAggregator[config.API_Constants.ADULT]], bqInsertObj);

      // Gets labels for video from its annotations
      const labels = annotations.segmentLabelAnnotations;
      if ((typeof(annotations.segmentLabelAnnotations) === "undefined") || (!annotations.segmentLabelAnnotations)) {
        console.error(`No segmentLabelAnnotations results included in response: ${JSON.stringify(segmentLabelAnnotations)}`);
      } else if (labels.length>0){
        bqInsertObj.labels = [];
        labels.forEach((label) => {
          bqInsertObj = addALabel(label.entity.description, bqInsertObj);
        });
      }

      console.info(bqInsertObj);
      return publishResult(config.BIGQUERY_TOPIC,bqInsertObj);

    })
    .then(() => {
      console.log(`File ${reqDataObj.gcsFile} processed.`);
    });
};
// [END functions_videoIntelligenceAPI]

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
 * Checks whether any of the SafeSearch values are set and returns true if so, otherwise false
 *
 * @param {Object} safeSearch The SafeSearch object from the Video Intelligence API
 */
function checkVideoForSafeSearchLiklihood(safeSearch){
  if (checkVideoSafeSearchLikelihood(safeSearch.pornographyLikelihood)) return true;
  return false;
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