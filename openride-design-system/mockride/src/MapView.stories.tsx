import type { Meta, StoryObj } from '@storybook/react-vite';
import { MapView } from './MapView';

const META = {
  title: 'Ride patterns/Map',
  component: MapView,
  args: {
    pickup: { latitude: -36.844, longitude: 174.768 },
    destination: { latitude: -36.869, longitude: 174.778 },
  },
} satisfies Meta<typeof MapView>;
export default META;
type Story = StoryObj<typeof META>;
export const PickupAndDestination: Story = {};
