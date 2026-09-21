import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';
import { GLOBALS_UPDATED } from 'storybook/internal/core-events';

function applyTheme(dark: boolean): void {
  addons.setConfig({
    theme: create({
      base: dark ? 'dark' : 'light',
      brandTitle: 'MockRide UI',
      colorPrimary: '#f9d949',
      // Storybook uses white text on selected sidebar items.
      colorSecondary: dark ? '#b39a3d' : '#202020',
      barSelectedColor: dark ? '#f9d949' : '#202020',
    }),
  });
}

applyTheme(false);
addons.register('mockride/appearance', () => {
  addons.getChannel().on(GLOBALS_UPDATED, ({ globals }: { globals: Record<string, unknown> }) => {
    applyTheme(globals.theme === 'Dark');
  });
});
