# Reward Maximizer Website

This folder contains the public website files for Reward Maximizer, ready to be deployed to Netlify Drop or any static hosting service.

## Files

- `index.html` - Main landing page
- `privacy.html` - Privacy Policy (required for Chrome Web Store)
- `terms.html` - Terms of Service (required for Chrome Web Store)

## Deployment Instructions

### Option 1: Netlify Drop (Easiest - No Account Required)

1. Go to https://app.netlify.com/drop
2. Drag and drop this entire `website` folder onto the page
3. Wait a few seconds for deployment
4. You'll get a URL like: `https://random-name-123.netlify.app/`
5. Save this URL - you'll need it for:
   - Chrome Web Store submission (Privacy Policy URL)
   - Extension manifest (if adding a homepage URL)

**To customize the URL (optional):**
- Create a free Netlify account
- Go to Site settings → Domain management
- Change site name to something like `reward-maximizer`
- New URL: `https://reward-maximizer.netlify.app/`

### Option 2: Netlify with Account (Free)

1. Create account at https://www.netlify.com/
2. Click "Add new site" → "Deploy manually"
3. Drag and drop the `website` folder
4. Customize site name in settings
5. Optional: Add custom domain

### Option 3: Vercel (Free)

1. Go to https://vercel.com/
2. Create account (free)
3. Click "Add New" → "Project"
4. Upload this folder
5. Get your public URL

### Option 4: GitHub Pages

1. Create a new public GitHub repository (e.g., `reward-maximizer-website`)
2. Upload these files to the repository
3. Go to Settings → Pages
4. Enable GitHub Pages from main branch
5. Your site will be at: `https://yourusername.github.io/reward-maximizer-website/`

## What to Do After Deployment

1. **Save your Privacy Policy URL**
   - Example: `https://your-site.netlify.app/privacy.html`
   - You'll need this for Chrome Web Store submission

2. **Save your Terms of Service URL**
   - Example: `https://your-site.netlify.app/terms.html`

3. **Test all pages**
   - Visit index.html to see the landing page
   - Click all navigation links to ensure they work
   - Verify email links open your email client

4. **Update Chrome Web Store Listing**
   - Add Privacy Policy URL when submitting extension
   - Add website URL (optional but recommended)

## Updating Content

To update the website after deployment:

**Netlify Drop:**
- Just drag and drop the folder again to the same URL
- It will overwrite the previous version

**Netlify with Account:**
- Drag and drop to update, or
- Connect to GitHub for automatic deployments

**GitHub Pages:**
- Push changes to your GitHub repository
- Changes will auto-deploy in a few minutes

## Support Email

All pages link to: **rewardmaximizer@gmail.com**

Make sure to check this email regularly for:
- User questions and feedback
- Bug reports
- Chrome Web Store review communications

## Next Steps

After deploying the website:
1. ✅ Get Privacy Policy URL
2. ✅ Get Terms of Service URL
3. Add these URLs to Chrome Web Store submission
4. Optionally add website URL to extension manifest.json

## Notes

- All pages are standalone HTML files (no dependencies)
- No build process required - just upload as-is
- Mobile responsive design
- Works offline after initial load
- No analytics or tracking (privacy-focused)
