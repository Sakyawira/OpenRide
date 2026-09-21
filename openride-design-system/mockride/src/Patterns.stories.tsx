import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge, Button, TripPanel } from './Components';

const META = { title: 'Foundations/Style guide' } satisfies Meta;
export default META;
type Story = StoryObj<typeof META>;
export const BrandAndFields: Story = {
  render: () => (
    <div className="catalogue-stack">
      <a className="brand" href="#">
        <span className="mark">M↗</span> MOCKRIDE
      </a>
      <p className="intro">
        Charcoal, warm neutrals and yellow. Choose Light or Dark in the toolbar.
      </p>
      <div>
        <Badge>HARBOUR COOPERATIVE</Badge>
      </div>
      <section className="request-panel">
        <label>
          PICKUP
          <input placeholder="Where from?" />
        </label>
        <label>
          RIDE PROVIDER
          <select defaultValue="city">
            <option value="city">City Cooperative</option>
            <option value="harbour">Harbour Cooperative</option>
          </select>
        </label>
        <label>
          DISABLED
          <input disabled value="Waiting for confirmation" readOnly />
        </label>
        <Button>GET MY PRICE ↗</Button>
      </section>
    </div>
  ),
};
export const ActiveTrip: Story = {
  render: () => (
    <TripPanel>
      <p className="section-label">YOUR ACTIVE RIDE</p>
      <Badge>DRIVER CONFIRMED</Badge>
      <h2>
        Britomart<span className="to">↓</span>Newmarket
      </h2>
      <p>City Cooperative</p>
      <strong className="trip-fare">NZD 15.00</strong>
      <Button>START TRIP ↗</Button>
      <Button className="secondary">Cancel ride</Button>
      <p className="trip-note">ONE DRIVER. ONE ACTIVE TRIP.</p>
    </TripPanel>
  ),
};
