'use client';

import { ArrowRight, BadgeCheck, Bookmark, Building2, ChevronLeft, ChevronRight, Globe2, MapPin, Users, WalletCards } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';

const assets = [
  { id: 'real-estate', type: 'Real estate', name: 'Harbourview Tower', location: 'Canary Wharf, London, UK', image: '/private-assets-hero-v2.png', alt: 'Illustrative waterfront office tower', value: '$92.80M', metrics: [['Expected yield', '8.7%'], ['Occupancy', '94%'], ['Risk profile', 'Moderate']], network: 'Live on Ethereum', progress: '40% available', progressValue: '60%', tokens: [['Total tokens', '928,000'], ['Token price', '$100'], ['Available', '371,200']] },
  { id: 'machinery', type: 'Machinery', name: 'Apex Precision Works', location: 'Stuttgart, Germany', image: '/industrial-machinery-platform.png', alt: 'Precision CNC machinery in a modern production facility', value: '$34.60M', metrics: [['Expected yield', '10.2%'], ['Utilization', '91%'], ['Risk profile', 'Moderate']], network: 'Live on Besu', progress: '32% available', progressValue: '68%', tokens: [['Total tokens', '346,000'], ['Token price', '$100'], ['Available', '110,720']] },
  { id: 'land', type: 'Development land', name: 'Riverside Development Parcel', location: 'Austin, Texas, USA', image: '/development-land-featured.png', alt: 'Illustrative aerial view of a development land asset', value: '$18.40M', metrics: [['Target IRR', '14.1%'], ['Entitlement', 'Advanced'], ['Risk profile', 'Balanced']], network: 'Live on Ethereum', progress: '55% available', progressValue: '45%', tokens: [['Total tokens', '184,000'], ['Token price', '$100'], ['Available', '101,200']] },
  { id: 'private-equity', type: 'Private equity', name: 'Nova Biosystems', location: 'Cambridge, Massachusetts, USA', image: '/private-equity-featured.png', alt: 'Illustrative advanced life sciences portfolio company campus', value: '$47.20M', metrics: [['Revenue growth', '22.4%'], ['EBITDA margin', '31%'], ['Risk profile', 'Growth']], network: 'Live on Besu', progress: '28% available', progressValue: '72%', tokens: [['Total tokens', '472,000'], ['Token price', '$100'], ['Available', '132,160']] },
] as const;

/** Illustrative records rotate together so facts and imagery always remain coherent. */
export function LandingAssetCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const asset = assets[activeIndex]!;
  const select = (index: number) => setActiveIndex((index + assets.length) % assets.length);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % assets.length), 6500);
    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <div className="landing-featured-asset" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocusCapture={() => setPaused(true)} onBlurCapture={() => setPaused(false)}>
      <div className="landing-featured-asset__record" key={asset.id}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="landing-featured-asset__eyebrow"><span aria-hidden="true" /> Featured asset <b><BadgeCheck size={11} /> Verified</b></div>
            <h2>{asset.name}</h2>
            <p className="landing-featured-asset__location"><MapPin size={13} /> {asset.location}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="landing-featured-asset__type">{asset.type}</span>
            <div className="landing-featured-asset__controls" aria-label="Featured assets">
              <button type="button" onClick={() => select(activeIndex - 1)} aria-label="Previous featured asset"><ChevronLeft size={15} /></button>
              <button type="button" onClick={() => select(activeIndex + 1)} aria-label="Next featured asset"><ChevronRight size={15} /></button>
            </div>
          </div>
        </div>
        <div className="landing-featured-asset__body">
          <div className="landing-featured-asset__gallery">
            <div className="landing-featured-asset__main-image"><Image src={asset.image} alt={asset.alt} fill priority={activeIndex === 0} sizes="(min-width: 1024px) 24rem, 100vw" className="object-cover" /></div>
            <div className="landing-featured-asset__thumbs" aria-hidden="true">{['20% 65%', '80% 45%', '62% 80%'].map((position) => <div key={position}><Image src={asset.image} alt="" fill sizes="4rem" className="object-cover" style={{ objectPosition: position }} /></div>)}</div>
          </div>
          <div className="landing-featured-asset__facts">
            <div className="landing-featured-asset__value"><p>Total asset value</p><strong>{asset.value}</strong></div>
            <div className="landing-featured-asset__metric-grid">{asset.metrics.map(([label, value]) => <div key={label}><p>{label}</p><strong>{value}</strong></div>)}</div>
            <div className="landing-featured-asset__tokenization"><div><p>Tokenization</p><strong>{asset.network}</strong></div><div className="landing-featured-asset__progress"><span style={{ width: asset.progressValue }} /></div><p>{asset.progress}</p></div>
            <div className="landing-featured-asset__token-stats">{asset.tokens.map(([label, value]) => <div key={label}><p>{label}</p><strong>{value}</strong></div>)}</div>
          </div>
        </div>
        <div className="landing-featured-asset__actions"><Link href="/login">View asset details <ArrowRight size={15} /></Link><button type="button"><Bookmark size={15} /> Add to watchlist</button></div>
        <div className="landing-featured-asset__dots" aria-label="Choose featured asset">{assets.map((item, index) => <button key={item.id} type="button" onClick={() => select(index)} aria-label={`Show ${item.name}`} aria-current={index === activeIndex}><span /></button>)}</div>
      </div>
      <div className="landing-featured-asset__proof"><div><Building2 /><span><b>1,200+</b>Verified assets</span></div><div><Users /><span><b>$12.4B+</b>Total asset value</span></div><div><WalletCards /><span><b>320+</b>Institutional investors</span></div><div><Globe2 /><span><b>25+</b>Countries</span></div></div>
    </div>
  );
}
