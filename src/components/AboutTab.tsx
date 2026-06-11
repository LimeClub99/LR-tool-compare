interface AboutTabProps {
  onNext: () => void;
}

export function AboutTab({ onNext }: AboutTabProps) {
  return (
    <>
      <section className="panel about-hero">
        <h2>How well do AI editors match your style?</h2>
        <p className="muted">
          A growing number of AI services promise to learn your editing style
          and apply it to new photos for you. This free tool puts that promise
          to the test: it prepares a set of your photos for each service to
          edit, then measures how closely the results match the way you edited
          them yourself. Compare several services side by side and see which one
          actually comes closest to your look.
        </p>
      </section>

      <section className="panel">
        <div className="flow">
          <div className="flow-step">
            <span className="actor actor-tool">This tool</span>
            <div className="flow-step-title">1 · Prepare your photos</div>
            <p className="muted small">
              It splits your edited photos into a batch{' '}
              <strong>to learn from</strong> (your style) and a separate batch{' '}
              <strong>to edit</strong> (reset to unedited), then saves a ready package for each
              service.
            </p>
          </div>

          <div className="flow-arrow" aria-hidden="true">→</div>

          <div className="flow-step flow-step-you">
            <span className="actor actor-you">You</span>
            <div className="flow-step-title">2 · Run each AI service</div>
            <p className="muted small">
              Take each package to its service (a free trial or your own
              account) and use it as normal: let it learn from your edits, edit
              the second batch, and save the result. This happens in their app.
            </p>
          </div>

          <div className="flow-arrow" aria-hidden="true">→</div>

          <div className="flow-step">
            <span className="actor actor-tool">This tool</span>
            <div className="flow-step-title">3 · Score the match</div>
            <p className="muted small">
              Load the edited photos back in. It compares each service's edits
              to <em>your</em> edits of the same photos and ranks how closely
              each matched your style.
            </p>
          </div>
        </div>

      </section>

      <section className="panel">
        <h2>See how each service improves as it learns more</h2>
        <p className="muted">
          A service should match your style more closely the more of your photos
          it has learned from. To see this, you can test each service several
          times: learning from, say, 2,000 of your photos, then 5,000, then
          10,000. Every service edits the same photos at each step.
        </p>
        <p className="muted">
          This is important to help understand real world usage. In normal use,
          images are continually added to a service in the hope that it will
          become more accurate. This test reproduces that real-world usage and
          determines whether providers are actually learning, or whether they are
          failing to improve with increasing training sizes.
        </p>
      </section>

      <section className="panel">
        <p className="muted small about-privacy">
          Everything runs in your browser. This tool doesn't use the cloud. You can review the source code yourself, here:{' '}
          <a href="https://github.com/LimeClub99/LR-tool-compare" target="_blank" rel="noopener noreferrer">
            github.com/LimeClub99/LR-tool-compare
          </a>
        </p>

        <div className="row gap" style={{ alignItems: 'center', marginTop: 4 }}>
          <button type="button" className="filebutton primary" onClick={onNext}>
            <span>Get started →</span>
          </button>
          <span className="muted small">Step 1 is on the Create tab.</span>
        </div>
      </section>
    </>
  );
}
