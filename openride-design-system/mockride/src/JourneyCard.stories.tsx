import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button, JourneyCard } from './Components';

const META = {
  title: 'Ride patterns/Journey card',
  component: JourneyCard,
  args: {
    badge: 'DRIVER CONFIRMED',
    detail: 'City Cooperative',
    pickup: 'Britomart',
    destination: 'Newmarket',
    amount: 'NZD 16.50',
    note: 'Your driver is on the way.',
  },
} satisfies Meta<typeof JourneyCard>;
export default META;
type Story = StoryObj<typeof META>;
export const RiderJourney: Story = {};
export const DriverOffer: Story = {
  args: {
    badge: 'Harbour Cooperative',
    detail: '4 min to pickup',
    note: '4.2 km · 14 min',
    action: <Button>ACCEPT RIDE ↗</Button>,
  },
};
export const UnavailableOffer: Story = {
  args: { ...DriverOffer.args, action: <Button disabled>ACCEPT RIDE ↗</Button> },
};
