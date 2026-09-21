import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './Components';

const META = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'ACCEPT RIDE ↗', disabled: false },
} satisfies Meta<typeof Button>;
export default META;
type Story = StoryObj<typeof META>;
export const Primary: Story = {};
export const Disabled: Story = { args: { disabled: true } };
export const TextAction: Story = { args: { children: 'Refresh ↻', className: 'text-button' } };
