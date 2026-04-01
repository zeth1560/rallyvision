'use client';

type BuyButtonProps = {
  clipId: string;
};

export default function BuyButton({ clipId }: BuyButtonProps) {
  async function handleClick() {
    try {
      const response = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clipId }),
      });

      const text = await response.text();
      console.log('Raw response text:', text);

      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (parseError) {
        console.error('JSON parse error:', parseError);
      }

      console.log('Parsed response data:', data);
      console.log('Response status:', response.status);

      if (data.url) {
        window.location.href = data.url;
      } else {
        alert('Something went wrong creating checkout. Check browser console and terminal.');
        console.error('Checkout error response:', data);
      }
    } catch (error) {
      alert('Fetch failed. Check browser console and terminal.');
      console.error('Fetch error:', error);
    }
  }

  return (
    <button
      onClick={handleClick}
      style={{
        marginTop: '1rem',
        padding: '0.75rem 1.25rem',
        background: 'black',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
      }}
    >
      Buy Download
    </button>
  );
}