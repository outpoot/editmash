

Download B2 CLI from [here](https://www.backblaze.com/docs/cloud-storage-command-line-tools) and run 

```
b2 bucket update --cors-rules "$(cat ./cors-rules.json)" <bucketName> <bucketType>