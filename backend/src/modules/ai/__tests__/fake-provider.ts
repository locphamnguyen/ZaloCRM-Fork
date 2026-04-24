/**
 * Fake AI provider for testing — mocks generateWithAnthropic/generateWithGemini
 */

export async function fakeProviderGenerate(_baseUrl: string, _apiKey: string, _model: string, _system: string, _prompt: string): Promise<string> {
  // Simulate async provider call
  return Promise.resolve('This is a fake AI response for testing.');
}

export async function fakeProviderSentimentResponse(): Promise<string> {
  return Promise.resolve(
    JSON.stringify({
      label: 'positive',
      confidence: 0.85,
      reason: 'Customer expressed satisfaction with the product.',
    })
  );
}

export async function fakeProviderMalformedResponse(): Promise<string> {
  return Promise.resolve('{ invalid json response }');
}
