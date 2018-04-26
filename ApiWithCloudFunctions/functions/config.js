module.exports = {
  VISION_TOPIC: "projects/" + process.env.GCLOUD_PROJECT + "/topics/visionapiservice",
  VIDEOINTELLIGENCE_TOPIC: "projects/" + process.env.GCLOUD_PROJECT + "/topics/videointelligenceservice",
  BIGQUERY_TOPIC: "projects/" + process.env.GCLOUD_PROJECT + "/topics/bqinsert",
  REJECTED_BUCKET: process.env.GCLOUD_PROJECT + "-flagged",
  RESULT_BUCKET: process.env.GCLOUD_PROJECT + "-filtered",
  DATASET_ID: "intelligentcontentfilter",
  TABLE_NAME: "filtered_content",
  GCS_AUTH_BROWSER_URL_BASE: "https=//storage.cloud.google.com/" ,
  API_Constants: {
    "ADULT": "adult",
    "VIOLENCE": "violence",
    "SPOOF": "spoof",
    "MEDICAL": "medical"
  }
}