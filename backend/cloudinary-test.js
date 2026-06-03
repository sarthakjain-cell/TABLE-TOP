const cloudinary = require('cloudinary').v2;

// 1. Configure Cloudinary
cloudinary.config({
  cloud_name: 'dilwalexv', // ← replace this (already filled with your value)
  api_key: '972896993373262', // ← replace this (already filled with your value)
  api_secret: '2aIUzOkztcXt_071vDdDi_E_Ez8' // ← replace this (already filled with your value)
});

async function run() {
  try {
    // 2. Upload an image
    console.log('Uploading image...');
    const uploadResult = await cloudinary.uploader.upload('https://res.cloudinary.com/demo/image/upload/sample.jpg', {
      public_id: 'my_sample_upload'
    });
    
    console.log('Upload successful!');
    console.log('Secure URL:', uploadResult.secure_url);
    console.log('Public ID:', uploadResult.public_id);

    // 3. Get image details
    console.log('\n--- Image Metadata ---');
    console.log('Width:', uploadResult.width, 'px');
    console.log('Height:', uploadResult.height, 'px');
    console.log('Format:', uploadResult.format);
    console.log('File Size:', uploadResult.bytes, 'bytes');

    // 4. Transform the image
    // f_auto: Automatically selects the most efficient image format based on the requesting browser
    // q_auto: Automatically optimizes image quality to minimize file size without noticeable degradation
    const transformedUrl = cloudinary.url(uploadResult.public_id, {
      fetch_format: 'auto',
      quality: 'auto'
    });
    
    console.log('\nDone! Click link below to see optimized version of the image. Check the size and the format.');
    console.log(transformedUrl);

  } catch (error) {
    console.error('Error during Cloudinary execution:', error);
  }
}

run();
