import type { Meta, StoryObj } from '@storybook/react-vite';
import { Notice } from './Components';

const META = {
  title: 'Components/Notice',
  component: Notice,
  args: { children: 'Your reservation is protected.', warning: false },
} satisfies Meta<typeof Notice>;
export default META;
type Story = StoryObj<typeof META>;
export const Information: Story = {};
export const Warning: Story = {
  args: {
    warning: true,
    children: 'The provider is offline. Your current booking remains protected.',
  },
};
