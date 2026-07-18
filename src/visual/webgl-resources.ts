export type AdaptiveVisualCanvas = HTMLCanvasElement | OffscreenCanvas;

export type FeedbackTextureFormat = {
  storage: 'rgba16f' | 'rgba8';
  internalFormat: number;
  format: number;
  type: number;
};

export type RenderTarget = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
};

export type AdaptiveVisualResources = {
  readonly gl: WebGL2RenderingContext;
  readonly feedbackFormat: FeedbackTextureFormat;
  readonly feedback: readonly [RenderTarget, RenderTarget];
  readonly modulationTexture: WebGLTexture;
  readonly bloom: readonly [RenderTarget, RenderTarget];
  readonly fullscreenVertexArray: WebGLVertexArrayObject;
  readonly faceSegmentBuffer: WebGLBuffer;
  width: number;
  height: number;
  resize(width: number, height: number): void;
  dispose(): void;
};

const defaultContextAttributes: WebGLContextAttributes = {
  alpha: false,
  antialias: false,
  depth: false,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: false,
  stencil: false,
};

function canvasKind(canvas: AdaptiveVisualCanvas): string {
  return 'transferControlToOffscreen' in canvas
    ? 'HTMLCanvasElement'
    : 'OffscreenCanvas';
}

function validateDimensions(width: number, height: number): void {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
  ) {
    throw new Error(
      `WebGL texture dimensions must be positive integers; received ${width}x${height}.`,
    );
  }
}

function glErrorName(gl: WebGL2RenderingContext, error: number): string {
  switch (error) {
    case gl.INVALID_ENUM:
      return 'INVALID_ENUM';
    case gl.INVALID_VALUE:
      return 'INVALID_VALUE';
    case gl.INVALID_OPERATION:
      return 'INVALID_OPERATION';
    case gl.INVALID_FRAMEBUFFER_OPERATION:
      return 'INVALID_FRAMEBUFFER_OPERATION';
    case gl.OUT_OF_MEMORY:
      return 'OUT_OF_MEMORY';
    case gl.CONTEXT_LOST_WEBGL:
      return 'CONTEXT_LOST_WEBGL';
    default:
      return `0x${error.toString(16)}`;
  }
}

function discardPendingErrors(gl: WebGL2RenderingContext): void {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    if (gl.getError() === gl.NO_ERROR) return;
  }
}

function throwOnGlError(gl: WebGL2RenderingContext, operation: string): void {
  const error = gl.getError();
  if (error !== gl.NO_ERROR) {
    throw new Error(`${operation} failed with WebGL ${glErrorName(gl, error)}.`);
  }
}

function shaderLabel(gl: WebGL2RenderingContext, type: number): string {
  if (type === gl.VERTEX_SHADER) return 'vertex';
  if (type === gl.FRAGMENT_SHADER) return 'fragment';
  return `unknown (${type})`;
}

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const label = shaderLabel(gl, type);
  const shader = gl.createShader(type);
  if (!shader) {
    throw new Error(`Unable to allocate the ${label} shader.`);
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const detail = gl.getShaderInfoLog(shader)?.trim() || 'No compiler log was provided.';
    gl.deleteShader(shader);
    throw new Error(`Unable to compile the ${label} shader: ${detail}`);
  }

  return shader;
}

function framebufferStatusName(
  gl: WebGL2RenderingContext,
  status: number,
): string {
  switch (status) {
    case gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT:
      return 'FRAMEBUFFER_INCOMPLETE_ATTACHMENT';
    case gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT:
      return 'FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT';
    case gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS:
      return 'FRAMEBUFFER_INCOMPLETE_DIMENSIONS';
    case gl.FRAMEBUFFER_UNSUPPORTED:
      return 'FRAMEBUFFER_UNSUPPORTED';
    case gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE:
      return 'FRAMEBUFFER_INCOMPLETE_MULTISAMPLE';
    default:
      return `0x${status.toString(16)}`;
  }
}

export function createWebGL2Context(
  canvas: AdaptiveVisualCanvas,
  attributes: WebGLContextAttributes = {},
): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    ...defaultContextAttributes,
    ...attributes,
  }) as WebGL2RenderingContext | null;
  if (!gl) {
    throw new Error(
      `Unable to create a WebGL2 context for this ${canvasKind(canvas)}. Check browser and GPU support.`,
    );
  }
  return gl;
}

export function selectFeedbackTextureFormat(
  gl: WebGL2RenderingContext,
): FeedbackTextureFormat {
  const colorBufferFloat = gl.getExtension('EXT_color_buffer_float');
  if (colorBufferFloat) {
    return {
      storage: 'rgba16f',
      internalFormat: gl.RGBA16F,
      format: gl.RGBA,
      type: gl.HALF_FLOAT,
    };
  }

  return {
    storage: 'rgba8',
    internalFormat: gl.RGBA8,
    format: gl.RGBA,
    type: gl.UNSIGNED_BYTE,
  };
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  let fragmentShader: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
    program = gl.createProgram();
    if (!program) throw new Error('Unable to allocate the WebGL shader program.');

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const detail = gl.getProgramInfoLog(program)?.trim() || 'No linker log was provided.';
      throw new Error(`Unable to link the WebGL shader program: ${detail}`);
    }

    return program;
  } catch (error) {
    if (program) gl.deleteProgram(program);
    throw error;
  } finally {
    gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
  }
}

export function createTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  internalFormat: number,
  format: number,
  type: number,
): WebGLTexture {
  validateDimensions(width, height);
  const texture = gl.createTexture();
  if (!texture) {
    throw new Error(`Unable to allocate a ${width}x${height} WebGL texture.`);
  }

  const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  try {
    discardPendingErrors(gl);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      width,
      height,
      0,
      format,
      type,
      null,
    );
    throwOnGlError(gl, `Allocating the ${width}x${height} WebGL texture`);
    return texture;
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, previousTexture);
  }
}

export function resizeTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number,
  internalFormat: number,
  format: number,
  type: number,
): void {
  validateDimensions(width, height);
  const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  try {
    discardPendingErrors(gl);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      internalFormat,
      width,
      height,
      0,
      format,
      type,
      null,
    );
    throwOnGlError(gl, `Resizing the WebGL texture to ${width}x${height}`);
  } finally {
    gl.bindTexture(gl.TEXTURE_2D, previousTexture);
  }
}

export function createFramebuffer(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('Unable to allocate a WebGL framebuffer.');

  const previousFramebuffer = gl.getParameter(
    gl.FRAMEBUFFER_BINDING,
  ) as WebGLFramebuffer | null;
  try {
    discardPendingErrors(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    );
    throwOnGlError(gl, 'Attaching the texture to the WebGL framebuffer');

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(
        `WebGL framebuffer is incomplete: ${framebufferStatusName(gl, status)}. Check the texture format and EXT_color_buffer_float support.`,
      );
    }
    return framebuffer;
  } catch (error) {
    gl.deleteFramebuffer(framebuffer);
    throw error;
  } finally {
    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
  }
}

function createRenderTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
  textureFormat: FeedbackTextureFormat,
): RenderTarget {
  const texture = createTexture(
    gl,
    width,
    height,
    textureFormat.internalFormat,
    textureFormat.format,
    textureFormat.type,
  );
  try {
    return { texture, framebuffer: createFramebuffer(gl, texture) };
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  }
}

function deleteRenderTarget(gl: WebGL2RenderingContext, target: RenderTarget): void {
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}

function createFullscreenVertexArray(gl: WebGL2RenderingContext): WebGLVertexArrayObject {
  const vertexArray = gl.createVertexArray();
  if (!vertexArray) {
    throw new Error('Unable to allocate the full-screen WebGL vertex array.');
  }
  return vertexArray;
}

function createFaceSegmentBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
  const buffer = gl.createBuffer();
  if (!buffer) throw new Error('Unable to allocate the dynamic face-segment buffer.');

  const previousBuffer = gl.getParameter(gl.ARRAY_BUFFER_BINDING) as WebGLBuffer | null;
  try {
    discardPendingErrors(gl);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
    throwOnGlError(gl, 'Allocating the dynamic face-segment buffer');
    return buffer;
  } catch (error) {
    gl.deleteBuffer(buffer);
    throw error;
  } finally {
    gl.bindBuffer(gl.ARRAY_BUFFER, previousBuffer);
  }
}

export function createAdaptiveVisualResources(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): AdaptiveVisualResources {
  validateDimensions(width, height);
  const feedbackFormat = selectFeedbackTextureFormat(gl);
  const allocatedTargets: RenderTarget[] = [];
  let modulationTexture: WebGLTexture | null = null;
  let fullscreenVertexArray: WebGLVertexArrayObject | null = null;
  let faceSegmentBuffer: WebGLBuffer | null = null;

  const releaseOwnedResources = (): void => {
    if (faceSegmentBuffer) gl.deleteBuffer(faceSegmentBuffer);
    if (fullscreenVertexArray) gl.deleteVertexArray(fullscreenVertexArray);
    if (modulationTexture) gl.deleteTexture(modulationTexture);
    for (const target of allocatedTargets) deleteRenderTarget(gl, target);

    faceSegmentBuffer = null;
    fullscreenVertexArray = null;
    modulationTexture = null;
    allocatedTargets.length = 0;
  };

  try {
    const feedbackA = createRenderTarget(gl, width, height, feedbackFormat);
    allocatedTargets.push(feedbackA);
    const feedbackB = createRenderTarget(gl, width, height, feedbackFormat);
    allocatedTargets.push(feedbackB);

    modulationTexture = createTexture(
      gl,
      1,
      1,
      gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
    );

    const bloomWidth = Math.max(1, Math.ceil(width / 2));
    const bloomHeight = Math.max(1, Math.ceil(height / 2));
    const bloomA = createRenderTarget(gl, bloomWidth, bloomHeight, feedbackFormat);
    allocatedTargets.push(bloomA);
    const bloomB = createRenderTarget(gl, bloomWidth, bloomHeight, feedbackFormat);
    allocatedTargets.push(bloomB);

    fullscreenVertexArray = createFullscreenVertexArray(gl);
    faceSegmentBuffer = createFaceSegmentBuffer(gl);

    const resources: AdaptiveVisualResources = {
      gl,
      feedbackFormat,
      feedback: [feedbackA, feedbackB],
      modulationTexture,
      bloom: [bloomA, bloomB],
      fullscreenVertexArray,
      faceSegmentBuffer,
      width,
      height,
      resize(nextWidth, nextHeight) {
        validateDimensions(nextWidth, nextHeight);
        if (resources.width === nextWidth && resources.height === nextHeight) return;

        for (const target of resources.feedback) {
          resizeTexture(
            gl,
            target.texture,
            nextWidth,
            nextHeight,
            feedbackFormat.internalFormat,
            feedbackFormat.format,
            feedbackFormat.type,
          );
        }

        const nextBloomWidth = Math.max(1, Math.ceil(nextWidth / 2));
        const nextBloomHeight = Math.max(1, Math.ceil(nextHeight / 2));
        for (const target of resources.bloom) {
          resizeTexture(
            gl,
            target.texture,
            nextBloomWidth,
            nextBloomHeight,
            feedbackFormat.internalFormat,
            feedbackFormat.format,
            feedbackFormat.type,
          );
        }

        resources.width = nextWidth;
        resources.height = nextHeight;
      },
      dispose() {
        releaseOwnedResources();
      },
    };

    return resources;
  } catch (error) {
    releaseOwnedResources();
    throw error;
  }
}
