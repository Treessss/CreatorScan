import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CustomSelect from '../components/CustomSelect';
import CustomMultiSelect from '../components/CustomMultiSelect';

const options = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'YouTube', value: 'youtube' },
];

function SingleSelectProbe() {
  const [value, setValue] = React.useState('tiktok');
  return (
    <div>
      <CustomSelect options={options} value={value} onChange={setValue} />
      <div data-testid="single-value">{value}</div>
    </div>
  );
}

function SearchableSelectProbe() {
  const [value, setValue] = React.useState('');
  return (
    <div>
      <CustomSelect
        options={[
          { label: '英国', value: 'GB|UK|United Kingdom|英国' },
          { label: '越南', value: 'VN|Vietnam|越南' },
          { label: '新加坡', value: 'SG|Singapore|新加坡' },
        ]}
        value={value}
        onChange={setValue}
        searchable
        searchPlaceholder="搜索国家/地区"
      />
      <div data-testid="searchable-value">{value}</div>
    </div>
  );
}

function MultiSelectProbe() {
  const [values, setValues] = React.useState<string[]>([]);
  return (
    <div>
      <CustomMultiSelect options={options} values={values} onChange={setValues} />
      <div data-testid="multi-values">{values.join(',')}</div>
    </div>
  );
}

describe('Custom select components', () => {
  it('CustomSelect updates selected value and closes on outside click', () => {
    render(<SingleSelectProbe />);

    fireEvent.click(screen.getByRole('button', { name: /TikTok/i }));
    fireEvent.click(screen.getByRole('button', { name: /Instagram/i }));
    expect(screen.getByTestId('single-value')).toHaveTextContent('instagram');

    fireEvent.click(screen.getByRole('button', { name: /Instagram/i }));
    expect(screen.getByRole('button', { name: /YouTube/i })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('button', { name: /YouTube/i })).not.toBeInTheDocument();
  });

  it('CustomMultiSelect toggles multiple values', () => {
    render(<MultiSelectProbe />);

    fireEvent.click(screen.getByRole('button', { name: /请选择/i }));

    const instagram = screen.getByLabelText('Instagram') as HTMLInputElement;
    const youtube = screen.getByLabelText('YouTube') as HTMLInputElement;

    fireEvent.click(instagram);
    fireEvent.click(youtube);
    expect(screen.getByTestId('multi-values')).toHaveTextContent('instagram,youtube');
    expect(screen.getByRole('button', { name: /已选择 2 项/i })).toBeInTheDocument();

    fireEvent.click(instagram);
    expect(screen.getByTestId('multi-values')).toHaveTextContent('youtube');
  });

  it('CustomSelect supports searching options', () => {
    render(<SearchableSelectProbe />);

    fireEvent.click(screen.getByRole('button', { name: /请选择/i }));
    fireEvent.change(screen.getByPlaceholderText('搜索国家/地区'), { target: { value: '越' } });
    expect(screen.getByRole('button', { name: '越南' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '英国' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '越南' }));

    expect(screen.getByTestId('searchable-value')).toHaveTextContent('VN|Vietnam|越南');
  });
});
