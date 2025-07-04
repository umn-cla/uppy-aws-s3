# @umn-cla/uppy-aws-s3

This is a tweaked version of @uppy/aws-s3 which does not abort if it cannot get the ETag header from the S3 upload response.

Instead, the backend is expected to get a list of etags when the multipart upload is complete.

## Example

```js
import Uppy from "@uppy/core";
import UmnAwsS3 from "@umn-cla/uppy-aws-s3";

const uppy = new Uppy();
uppy.use(UmnAwsS3, {
  limit: 2,
  timeout: ms("1 minute"),
  companionUrl: "https://companion.myapp.com/",
});
```

## Installation

```bash
$ npm install @umn-cla/uppy-aws-s3
```
