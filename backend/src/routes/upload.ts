import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { requireRole } from '../middleware/auth';
import cloudinary from 'cloudinary';

// Configure Cloudinary with env variables
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadRoutes: FastifyPluginAsync = async (fastify, opts) => {
  fastify.post('/api/upload', { preHandler: requireRole(['ADMIN']) }, async (request, reply) => {
    try {
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No file uploaded' });
      }

      const buffer = await data.toBuffer();

      // Upload directly to Cloudinary via stream
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.v2.uploader.upload_stream(
          { folder: 'tabletop_menu' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        uploadStream.end(buffer);
      });

      return reply.send({ url: (uploadResult as any).secure_url });
    } catch (error) {
      fastify.log.error('Upload Error:', error);
      return reply.code(500).send({ error: 'Failed to upload image' });
    }
  });
};

export default uploadRoutes;
