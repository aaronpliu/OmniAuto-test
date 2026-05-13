import { describe, it, beforeAll } from '@jest/globals';
import { ActionFactory } from '@framework/actions';
import { HomePage } from '@applications/your-app/pages/HomePage';

describe('Mobile Home Tests', () => {
  let homePage: HomePage;

  beforeAll(async () => {
    const platform = (process.env.TEST_PLATFORM || 'ios') as 'ios' | 'android';
    const actions = ActionFactory.create(platform);
    homePage = new HomePage(actions);
  });

  it('should display welcome message', async () => {
    const message = await homePage.getWelcomeMessage();
    expect(message).toBeTruthy();
  });

  it('should navigate to profile', async () => {
    await homePage.navigateToProfile();
  });
});
