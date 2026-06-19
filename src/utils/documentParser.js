import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Configure PDFJS Worker
// To avoid compilation headaches with Vite Web Workers, we use the standard CDN worker URL.
// Since pdfjs-dist is loaded, we match the major version.
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Extracts text and images from a PDF file.
 * @param {ArrayBuffer} arrayBuffer 
 * @returns {Promise<{text: string, images: string[], pages: string[]}>}
 */
export async function parsePDF(arrayBuffer) {
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  let fullText = '';
  const images = [];
  const pages = [];
  
  const totalPages = Math.min(pdf.numPages, 10); // Limit to 10 pages for performance
  
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    
    // 1. Extract Text
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += `\n--- Page ${pageNum} ---\n` + pageText;
    
    // 2. Render Page to Canvas (Layout view)
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    
    await page.render({ canvasContext: context, viewport }).promise;
    const pageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    pages.push(pageDataUrl);
    
    // 3. Extract Embedded Images
    try {
      const operatorList = await page.getOperatorList();
      
      for (let i = 0; i < operatorList.fnArray.length; i++) {
        const fn = operatorList.fnArray[i];
        
        // Match paint image operators (paintImageXObject, paintInlineImageXObject, paintJpegXObject)
        if (
          fn === pdfjsLib.OPS.paintImageXObject || 
          fn === pdfjsLib.OPS.paintJpegXObject || 
          fn === pdfjsLib.OPS.paintInlineImageXObject
        ) {
          const args = operatorList.argsArray[i];
          const objId = args[0];
          
          const imgData = await new Promise((resolve) => {
            page.objs.get(objId, (resolved) => {
              resolve(resolved);
            });
          });
          
          if (imgData) {
            let dataUrl = '';
            
            if (imgData instanceof ImageBitmap) {
              const imgCanvas = document.createElement('canvas');
              imgCanvas.width = imgData.width;
              imgCanvas.height = imgData.height;
              const imgCtx = imgCanvas.getContext('2d');
              imgCtx.drawImage(imgData, 0, 0);
              dataUrl = imgCanvas.toDataURL('image/jpeg', 0.85);
            } else if (imgData.width && imgData.height && imgData.data) {
              const imgCanvas = document.createElement('canvas');
              imgCanvas.width = imgData.width;
              imgCanvas.height = imgData.height;
              const imgCtx = imgCanvas.getContext('2d');
              
              const numPixels = imgData.width * imgData.height;
              const rgbaData = new Uint8ClampedArray(numPixels * 4);
              
              // Handle RGB vs RGBA
              if (imgData.data.length === numPixels * 3) {
                // RGB
                for (let p = 0; p < numPixels; p++) {
                  rgbaData[p * 4] = imgData.data[p * 3];     // R
                  rgbaData[p * 4 + 1] = imgData.data[p * 3 + 1]; // G
                  rgbaData[p * 4 + 2] = imgData.data[p * 3 + 2]; // B
                  rgbaData[p * 4 + 3] = 255;                   // A
                }
              } else if (imgData.data.length === numPixels * 4) {
                // RGBA
                rgbaData.set(imgData.data);
              } else {
                rgbaData.set(imgData.data.subarray(0, rgbaData.length));
              }
              
              const imageData = new ImageData(rgbaData, imgData.width, imgData.height);
              imgCtx.putImageData(imageData, 0, 0);
              dataUrl = imgCanvas.toDataURL('image/jpeg', 0.85);
            }
            
            // Limit duplicate base64 images or tiny artifacts (like icons < 40px)
            if (dataUrl && imgData.width > 40 && imgData.height > 40) {
              if (!images.includes(dataUrl)) {
                images.push(dataUrl);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn("Could not extract embedded images from page " + pageNum, err);
    }
  }
  
  return {
    text: fullText.trim(),
    images: images.slice(0, 12), // Limit to top 12 extracted images
    pages
  };
}

/**
 * Extracts text and images from a Word Document (.docx).
 * @param {ArrayBuffer} arrayBuffer 
 * @returns {Promise<{text: string, images: string[], pages: string[]}>}
 */
export async function parseDOCX(arrayBuffer) {
  // Extract text and convert images to base64 automatically in HTML output
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const htmlContent = result.value;
  
  // Create a temporary DOM parser to read the text and images cleanly
  const domParser = new DOMParser();
  const doc = domParser.parseFromString(htmlContent, 'text/html');
  
  // Extract clean text
  const text = doc.body.textContent || '';
  
  // Extract base64 images
  const images = [];
  const imgElements = doc.querySelectorAll('img');
  
  imgElements.forEach((img) => {
    const src = img.getAttribute('src');
    if (src && src.startsWith('data:image/')) {
      if (!images.includes(src)) {
        images.push(src);
      }
    }
  });
  
  return {
    text: text.trim(),
    images: images.slice(0, 12), // Limit to top 12 images
    pages: [] // Word documents do not have distinct visual pages like PDF renders
  };
}

/**
 * Main parser router based on file type.
 * @param {File} file 
 * @returns {Promise<{text: string, images: string[], pages: string[], filename: string}>}
 */
export async function parseDocument(file) {
  const arrayBuffer = await file.arrayBuffer();
  let result;
  
  if (file.name.toLowerCase().endsWith('.pdf')) {
    result = await parsePDF(arrayBuffer);
  } else if (file.name.toLowerCase().endsWith('.docx')) {
    result = await parseDOCX(arrayBuffer);
  } else {
    throw new Error('Unsupported file format. Please upload a PDF or .docx file.');
  }
  
  return {
    ...result,
    filename: file.name
  };
}
