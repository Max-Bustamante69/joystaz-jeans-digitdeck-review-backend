# Shopify Review System Backend

A Node.js backend service for managing product reviews with Shopify integration.

## Features

- Create, read, update, and delete product reviews
- Image and video upload support
- Shopify metaobject integration
- Rate limiting and security
- Comprehensive API endpoints

## Prerequisites

- Node.js 16+ 
- npm or yarn
- Shopify store with Admin API access
- Environment variables configured

## Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd joystaz-jeans-digitdeck-review-backend
npm install
```

### 2. Configure Environment

Create a `.env` file in the project root:

```env
SHOPIFY_STORE_DOMAIN="your-store.myshopify.com"
SHOPIFY_ADMIN_API_ACCESS_TOKEN="your_shopify_admin_api_access_token_here"
SHOPIFY_API_KEY="your_shopify_api_key_here"
SHOPIFY_SECRET_API_KEY="your_shopify_secret_api_key_here"
PORT=3001
CORS_ORIGIN="http://localhost:3000,https://your-store.myshopify.com"
```

### 3. Start the Server

```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Reviews

- `POST /api/reviews` - Create a new review
- `GET /api/reviews/product/:productId` - Get reviews for a product
- `GET /api/reviews/stats/:productId` - Get review statistics
- `GET /api/reviews` - Get all reviews (admin)
- `PUT /api/reviews/:ratingId` - Update a review
- `DELETE /api/reviews/:ratingId` - Delete a review
- `PUT /api/reviews/:ratingId/publish` - Publish a review
- `POST /api/reviews/publish-all-drafts` - Publish all draft reviews

### Health Check

- `GET /health` - Service health status

## Review Data Structure

```json
{
  "productId": 123456789,
  "rating": 5,
  "title": "Great product!",
  "body": "Really happy with this purchase.",
  "authorName": "John Doe",
  "authorEmail": "john@example.com",
  "isVerifiedBuyer": true,
  "ageRange": "25-34",
  "sizePurchased": "M",
  "fitRating": 4,
  "shippingRating": 5,
  "recommendsProduct": true,
  "image": "data:image/jpeg;base64,/9j/4AAQ...",
  "video": "data:video/mp4;base64,AAAAGGZ0eXA..."
}
```

## Media Upload

The system supports image and video uploads:

- **Images**: JPEG, PNG, GIF (max 5MB)
- **Videos**: MP4, WebM (max 5MB)
- Files are converted to base64 and uploaded to Shopify
- Media is linked to reviews via Shopify metaobjects

## Rate Limiting

- Review creation: 20 submissions per hour per IP
- General API: 100 requests per 15 minutes per IP

## Security

- CORS protection
- Helmet security headers
- Input validation with Joi
- Rate limiting
- Environment variable protection

## Development

### Project Structure

```
src/
├── app.js              # Express app configuration
├── config/             # Configuration files
├── controllers/        # Route controllers
├── routes/            # API routes
└── services/          # Business logic services
```

### Testing

```bash
# Run tests
npm test

# Test with sample data
curl -X POST http://localhost:3001/api/reviews \
  -H "Content-Type: application/json" \
  -d @test-review.json
```

## Deployment

1. Set up environment variables in production
2. Configure CORS origins for your domain
3. Set up SSL/TLS certificates
4. Configure reverse proxy (nginx/Apache)
5. Set up monitoring and logging

## Troubleshooting

### Common Issues

1. **Shopify API Errors**: Check your access token and store domain
2. **File Upload Failures**: Verify file size and type restrictions
3. **CORS Issues**: Update CORS_ORIGIN environment variable
4. **Rate Limiting**: Adjust limits in `src/routes/reviewRoutes.js`

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
```

## Support

For issues and questions, please check the logs and ensure all environment variables are properly configured.
