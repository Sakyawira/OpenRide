import type { Preview } from '@storybook/react-vite';
import { withThemeByDataAttribute } from '@storybook/addon-themes';
import '@/styles.css';

const PREVIEW: Preview = {
  parameters: { layout: 'fullscreen' },
  decorators: [
    withThemeByDataAttribute({
      themes: { Light: 'light', Dark: 'dark' },
      defaultTheme: 'Light',
      attributeName: 'data-theme',
    }),
    (Story) => (
      <div className="catalogue-preview">
        <Story />
      </div>
    ),
  ],
};
export default PREVIEW;
