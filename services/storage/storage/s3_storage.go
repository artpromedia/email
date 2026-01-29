package storage

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/rs/zerolog"

	"github.com/enterprise-email/storage/config"
	"github.com/enterprise-email/storage/models"
)

// S3StorageService implements StorageService using S3-compatible storage
type S3StorageService struct {
	client         *s3.Client
	presignClient  *s3.PresignClient
	bucket         string
	presignExpiry  time.Duration
	logger         zerolog.Logger
}

// NewS3StorageService creates a new S3-compatible storage service
func NewS3StorageService(cfg *config.Config, logger zerolog.Logger) (*S3StorageService, error) {
	// Create custom endpoint resolver for MinIO/S3-compatible services
	customResolver := aws.EndpointResolverWithOptionsFunc(func(service, region string, options ...interface{}) (aws.Endpoint, error) {
		if cfg.S3Endpoint != "" {
			return aws.Endpoint{
				URL:               cfg.S3Endpoint,
				HostnameImmutable: true,
				SigningRegion:     cfg.S3Region,
			}, nil
		}
		return aws.Endpoint{}, &aws.EndpointNotFoundError{}
	})

	// Load AWS config
	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(),
		awsconfig.WithRegion(cfg.S3Region),
		awsconfig.WithEndpointResolverWithOptions(customResolver),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.S3AccessKey,
			cfg.S3SecretKey,
			"",
		)),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	// Create S3 client
	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = cfg.S3UsePathStyle
	})

	// Create presign client
	presignClient := s3.NewPresignClient(client)

	svc := &S3StorageService{
		client:        client,
		presignClient: presignClient,
		bucket:        cfg.S3Bucket,
		presignExpiry: cfg.S3PresignDuration,
		logger:        logger.With().Str("component", "s3_storage").Logger(),
	}

	// Ensure bucket exists
	if err := svc.ensureBucketExists(context.Background()); err != nil {
		return nil, fmt.Errorf("failed to ensure bucket exists: %w", err)
	}

	return svc, nil
}

// ensureBucketExists creates the bucket if it doesn't exist
func (s *S3StorageService) ensureBucketExists(ctx context.Context) error {
	_, err := s.client.HeadBucket(ctx, &s3.HeadBucketInput{
		Bucket: aws.String(s.bucket),
	})
	if err != nil {
		// Try to create the bucket
		_, createErr := s.client.CreateBucket(ctx, &s3.CreateBucketInput{
			Bucket: aws.String(s.bucket),
		})
		if createErr != nil {
			// Check if it's a "bucket already exists" error
			if !strings.Contains(createErr.Error(), "BucketAlreadyOwnedByYou") &&
				!strings.Contains(createErr.Error(), "BucketAlreadyExists") {
				return createErr
			}
		}
		s.logger.Info().Str("bucket", s.bucket).Msg("Created storage bucket")
	}
	return nil
}

// Put uploads an object to S3
func (s *S3StorageService) Put(ctx context.Context, key string, reader io.Reader, size int64, contentType string, metadata map[string]string) error {
	input := &s3.PutObjectInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		Body:          reader,
		ContentLength: aws.Int64(size),
		ContentType:   aws.String(contentType),
	}

	if len(metadata) > 0 {
		input.Metadata = metadata
	}

	_, err := s.client.PutObject(ctx, input)
	if err != nil {
		return fmt.Errorf("failed to put object: %w", err)
	}

	s.logger.Debug().
		Str("key", key).
		Int64("size", size).
		Str("content_type", contentType).
		Msg("Uploaded object")

	return nil
}

// Get retrieves an object from S3
func (s *S3StorageService) Get(ctx context.Context, key string) (io.ReadCloser, *models.StorageObject, error) {
	output, err := s.client.GetObject(ctx, &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, nil, fmt.Errorf("failed to get object: %w", err)
	}

	obj := &models.StorageObject{
		Key:          key,
		Size:         aws.ToInt64(output.ContentLength),
		ContentType:  aws.ToString(output.ContentType),
		ETag:         strings.Trim(aws.ToString(output.ETag), "\""),
		LastModified: aws.ToTime(output.LastModified),
		Metadata:     output.Metadata,
	}

	return output.Body, obj, nil
}

// Delete removes an object from S3
func (s *S3StorageService) Delete(ctx context.Context, key string) error {
	_, err := s.client.DeleteObject(ctx, &s3.DeleteObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return fmt.Errorf("failed to delete object: %w", err)
	}

	s.logger.Debug().Str("key", key).Msg("Deleted object")
	return nil
}

// Exists checks if an object exists
func (s *S3StorageService) Exists(ctx context.Context, key string) (bool, error) {
	_, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		// Check if it's a not found error
		if strings.Contains(err.Error(), "NotFound") || strings.Contains(err.Error(), "404") {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

// GetMetadata retrieves metadata for an object
func (s *S3StorageService) GetMetadata(ctx context.Context, key string) (*models.StorageObject, error) {
	output, err := s.client.HeadObject(ctx, &s3.HeadObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	})
	if err != nil {
		return nil, fmt.Errorf("failed to get object metadata: %w", err)
	}

	return &models.StorageObject{
		Key:          key,
		Size:         aws.ToInt64(output.ContentLength),
		ContentType:  aws.ToString(output.ContentType),
		ETag:         strings.Trim(aws.ToString(output.ETag), "\""),
		LastModified: aws.ToTime(output.LastModified),
		Metadata:     output.Metadata,
	}, nil
}

// List lists objects with a prefix
func (s *S3StorageService) List(ctx context.Context, prefix string, maxKeys int, startAfter string) (*models.ListResponse, error) {
	input := &s3.ListObjectsV2Input{
		Bucket: aws.String(s.bucket),
		Prefix: aws.String(prefix),
	}

	if maxKeys > 0 {
		input.MaxKeys = aws.Int32(int32(maxKeys))
	}
	if startAfter != "" {
		input.StartAfter = aws.String(startAfter)
	}

	output, err := s.client.ListObjectsV2(ctx, input)
	if err != nil {
		return nil, fmt.Errorf("failed to list objects: %w", err)
	}

	objects := make([]*models.StorageObject, len(output.Contents))
	for i, obj := range output.Contents {
		objects[i] = &models.StorageObject{
			Key:          aws.ToString(obj.Key),
			Size:         aws.ToInt64(obj.Size),
			ETag:         strings.Trim(aws.ToString(obj.ETag), "\""),
			LastModified: aws.ToTime(obj.LastModified),
		}
	}

	resp := &models.ListResponse{
		Objects:     objects,
		IsTruncated: aws.ToBool(output.IsTruncated),
	}

	if output.NextContinuationToken != nil {
		resp.NextMarker = aws.ToString(output.NextContinuationToken)
	}

	return resp, nil
}

// ListAll lists all objects with a prefix (handles pagination)
func (s *S3StorageService) ListAll(ctx context.Context, prefix string) ([]*models.StorageObject, error) {
	var allObjects []*models.StorageObject
	var continuationToken *string

	for {
		input := &s3.ListObjectsV2Input{
			Bucket: aws.String(s.bucket),
			Prefix: aws.String(prefix),
		}
		if continuationToken != nil {
			input.ContinuationToken = continuationToken
		}

		output, err := s.client.ListObjectsV2(ctx, input)
		if err != nil {
			return nil, fmt.Errorf("failed to list objects: %w", err)
		}

		for _, obj := range output.Contents {
			allObjects = append(allObjects, &models.StorageObject{
				Key:          aws.ToString(obj.Key),
				Size:         aws.ToInt64(obj.Size),
				ETag:         strings.Trim(aws.ToString(obj.ETag), "\""),
				LastModified: aws.ToTime(obj.LastModified),
			})
		}

		if !aws.ToBool(output.IsTruncated) {
			break
		}
		continuationToken = output.NextContinuationToken
	}

	return allObjects, nil
}

// GetPresignedUploadURL generates a presigned URL for uploading
func (s *S3StorageService) GetPresignedUploadURL(ctx context.Context, key string, contentType string, expiry time.Duration) (string, error) {
	input := &s3.PutObjectInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	}

	if expiry == 0 {
		expiry = s.presignExpiry
	}

	presignedReq, err := s.presignClient.PresignPutObject(ctx, input, s3.WithPresignExpires(expiry))
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned upload URL: %w", err)
	}

	return presignedReq.URL, nil
}

// GetPresignedDownloadURL generates a presigned URL for downloading
func (s *S3StorageService) GetPresignedDownloadURL(ctx context.Context, key string, expiry time.Duration) (string, error) {
	input := &s3.GetObjectInput{
		Bucket: aws.String(s.bucket),
		Key:    aws.String(key),
	}

	if expiry == 0 {
		expiry = s.presignExpiry
	}

	presignedReq, err := s.presignClient.PresignGetObject(ctx, input, s3.WithPresignExpires(expiry))
	if err != nil {
		return "", fmt.Errorf("failed to generate presigned download URL: %w", err)
	}

	return presignedReq.URL, nil
}

// Copy copies an object to a new key
func (s *S3StorageService) Copy(ctx context.Context, sourceKey, destKey string) error {
	_, err := s.client.CopyObject(ctx, &s3.CopyObjectInput{
		Bucket:     aws.String(s.bucket),
		CopySource: aws.String(fmt.Sprintf("%s/%s", s.bucket, sourceKey)),
		Key:        aws.String(destKey),
	})
	if err != nil {
		return fmt.Errorf("failed to copy object: %w", err)
	}

	s.logger.Debug().
		Str("source", sourceKey).
		Str("dest", destKey).
		Msg("Copied object")

	return nil
}

// Move moves an object to a new key
func (s *S3StorageService) Move(ctx context.Context, sourceKey, destKey string) error {
	if err := s.Copy(ctx, sourceKey, destKey); err != nil {
		return err
	}
	return s.Delete(ctx, sourceKey)
}

// DeleteMultiple deletes multiple objects
func (s *S3StorageService) DeleteMultiple(ctx context.Context, keys []string) (deleted int, errors []error) {
	if len(keys) == 0 {
		return 0, nil
	}

	// S3 DeleteObjects can handle up to 1000 keys at once
	batchSize := 1000
	for i := 0; i < len(keys); i += batchSize {
		end := i + batchSize
		if end > len(keys) {
			end = len(keys)
		}

		batch := keys[i:end]
		objects := make([]types.ObjectIdentifier, len(batch))
		for j, key := range batch {
			objects[j] = types.ObjectIdentifier{
				Key: aws.String(key),
			}
		}

		output, err := s.client.DeleteObjects(ctx, &s3.DeleteObjectsInput{
			Bucket: aws.String(s.bucket),
			Delete: &types.Delete{
				Objects: objects,
				Quiet:   aws.Bool(true),
			},
		})
		if err != nil {
			errors = append(errors, fmt.Errorf("failed to delete batch starting at %d: %w", i, err))
			continue
		}

		deleted += len(batch) - len(output.Errors)
		for _, e := range output.Errors {
			errors = append(errors, fmt.Errorf("failed to delete %s: %s", aws.ToString(e.Key), aws.ToString(e.Message)))
		}
	}

	s.logger.Info().
		Int("deleted", deleted).
		Int("errors", len(errors)).
		Msg("Bulk delete completed")

	return deleted, errors
}

// DeleteByPrefix deletes all objects with a prefix
func (s *S3StorageService) DeleteByPrefix(ctx context.Context, prefix string) (deleted int, errors []error) {
	objects, err := s.ListAll(ctx, prefix)
	if err != nil {
		return 0, []error{err}
	}

	keys := make([]string, len(objects))
	for i, obj := range objects {
		keys[i] = obj.Key
	}

	return s.DeleteMultiple(ctx, keys)
}

// InitiateMultipartUpload starts a multipart upload
func (s *S3StorageService) InitiateMultipartUpload(ctx context.Context, key string, contentType string) (string, error) {
	output, err := s.client.CreateMultipartUpload(ctx, &s3.CreateMultipartUploadInput{
		Bucket:      aws.String(s.bucket),
		Key:         aws.String(key),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("failed to initiate multipart upload: %w", err)
	}
	return aws.ToString(output.UploadId), nil
}

// UploadPart uploads a part in a multipart upload
func (s *S3StorageService) UploadPart(ctx context.Context, key string, uploadID string, partNumber int, reader io.Reader, size int64) (string, error) {
	output, err := s.client.UploadPart(ctx, &s3.UploadPartInput{
		Bucket:        aws.String(s.bucket),
		Key:           aws.String(key),
		UploadId:      aws.String(uploadID),
		PartNumber:    aws.Int32(int32(partNumber)),
		Body:          reader,
		ContentLength: aws.Int64(size),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload part: %w", err)
	}
	return strings.Trim(aws.ToString(output.ETag), "\""), nil
}

// CompleteMultipartUpload completes a multipart upload
func (s *S3StorageService) CompleteMultipartUpload(ctx context.Context, key string, uploadID string, parts []CompletedPart) error {
	completedParts := make([]types.CompletedPart, len(parts))
	for i, part := range parts {
		completedParts[i] = types.CompletedPart{
			PartNumber: aws.Int32(int32(part.PartNumber)),
			ETag:       aws.String(part.ETag),
		}
	}

	_, err := s.client.CompleteMultipartUpload(ctx, &s3.CompleteMultipartUploadInput{
		Bucket:   aws.String(s.bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
		MultipartUpload: &types.CompletedMultipartUpload{
			Parts: completedParts,
		},
	})
	if err != nil {
		return fmt.Errorf("failed to complete multipart upload: %w", err)
	}
	return nil
}

// AbortMultipartUpload aborts a multipart upload
func (s *S3StorageService) AbortMultipartUpload(ctx context.Context, key string, uploadID string) error {
	_, err := s.client.AbortMultipartUpload(ctx, &s3.AbortMultipartUploadInput{
		Bucket:   aws.String(s.bucket),
		Key:      aws.String(key),
		UploadId: aws.String(uploadID),
	})
	if err != nil {
		return fmt.Errorf("failed to abort multipart upload: %w", err)
	}
	return nil
}

// GetBucketSize returns the total size of the bucket
func (s *S3StorageService) GetBucketSize(ctx context.Context) (int64, error) {
	return s.GetPrefixSize(ctx, "")
}

// GetPrefixSize returns the total size of objects with a prefix
func (s *S3StorageService) GetPrefixSize(ctx context.Context, prefix string) (int64, error) {
	var totalSize int64

	objects, err := s.ListAll(ctx, prefix)
	if err != nil {
		return 0, err
	}

	for _, obj := range objects {
		totalSize += obj.Size
	}

	return totalSize, nil
}
