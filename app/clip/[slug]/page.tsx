import { supabase } from '@/lib/supabase';
import BuyButton from '@/app/components/BuyButton';
import SessionPreview from '@/app/components/SessionPreview';
import RallyVisionPageShell from '@/app/components/RallyVisionPageShell';

export default async function ClipPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: clip, error } = await supabase
    .from('clips')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single();

  if (error || !clip) {
    return (
      <RallyVisionPageShell
        title="Clip Unavailable"
        subtitle="We couldn’t find that clip."
        maxWidth="1200px"
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '24px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, color: '#444' }}>
            We couldn’t find that clip.
          </p>
        </div>
      </RallyVisionPageShell>
    );
  }

  return (
    <RallyVisionPageShell
      title="Clip Details"
      subtitle="Preview your clip and purchase the full-resolution download."
      maxWidth="1200px"
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.3fr) minmax(320px, 0.7fr)',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '18px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
          }}
        >
          <SessionPreview slug={clip.slug} />
        </div>

        <div
          style={{
            border: '1px solid #dedede',
            borderRadius: '16px',
            padding: '24px',
            background: '#ffffff',
            boxShadow: '0 8px 24px rgba(0,0,0,0.07)',
            position: 'sticky',
            top: '20px',
          }}
        >
          <h1
            style={{
              marginTop: 0,
              marginBottom: '10px',
              fontSize: '1.75rem',
              color: '#17191c',
            }}
          >
            {clip.title}
          </h1>

          <p
            style={{
              fontSize: '1.45rem',
              fontWeight: 800,
              margin: '0 0 18px',
              color: '#111',
            }}
          >
            ${(clip.price_cents / 100).toFixed(2)}
          </p>

          <p
            style={{
              margin: '0 0 18px',
              color: '#555',
              lineHeight: 1.5,
            }}
          >
            Purchase this clip to unlock a secure HD download.
          </p>

          <div
            style={{
              padding: '16px',
              borderRadius: '12px',
              background: '#f8f8f8',
              border: '1px solid #ececec',
            }}
          >
            <BuyButton clipId={clip.id} />
          </div>
        </div>
      </div>
    </RallyVisionPageShell>
  );
}