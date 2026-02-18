// embedding-gemma-webgpu.ts
import { pipeline } from '@huggingface/transformers';

// Optional: Auto-detect WebGPU availability (useful for Bun/browser hybrid code)
async function getBestDevice() {
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) {
        console.log('WebGPU detected ✓');
        return 'webgpu';
      }
    } catch (err) {
      console.warn('WebGPU request failed:', err);
    }
  }
  console.log('Falling back to WASM/CPU');
  return 'auto'; // or 'wasm' explicitly
}

async function main() {
  const device = await getBestDevice();

  console.time('Model load');
  const extractor = await pipeline(
    'feature-extraction',
    'onnx-community/embeddinggemma-300m-ONNX',
    {
      device:'cpu',                    // 'webgpu' if available
      dtype: 'q4',               // Recommended: q4 or q8 for speed/memory on GPU
      // quantized: true,        // Often implicit with dtype
      // progress_callback: (progress) => console.log(`Download: ${progress}%`)
    }
  );
  console.timeEnd('Model load');

  const texts = [
    "query: Bun + WebGPU makes local embeddings blazing fast in JS.",
    "document: EmbeddingGemma is a compact, high-quality multilingual model from Google."
  ];

  console.time('Inference');
  const output = await extractor(texts, {
    pooling: 'mean',     // Standard for sentence embeddings
    normalize: true      // Unit vectors → ready for cosine similarity
  });
  console.timeEnd('Inference');

  // output is a Tensor; extract embeddings
  const embeddings = output.tolist(); // Array<number[]>: [batch_size, dim]

  console.log(`Generated ${embeddings.length} embeddings (${embeddings[0].length} dims each)`);
  // Example: First 5 values of first embedding
  console.log(embeddings[0].slice(0, 5));
}

main().catch(console.error);
