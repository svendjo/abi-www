import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the Balut Eye heading', () => {
  render(<App />);
  const heading = screen.getByText(/Balut Eye/i);
  expect(heading).toBeInTheDocument();
});
