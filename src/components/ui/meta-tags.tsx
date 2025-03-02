import React, { FC } from 'react'

type Props = {
  path: string
  description: string
  title: string
}

export const MetaTags: FC<Props> = ({ path, description, title }) => {
  const baseUrl = 'https://spec-view.vercel.app'
  return (
    <>
      <meta property="og:type" content="website" />
      <meta property="og:url" content={`${baseUrl}${path}`} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content="/images/paytrix-doc-og.jpg" />

      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={`${baseUrl}${path}`} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content="/images/paytrix-doc-og.jpg" />

      <meta name="format-detection" content="telephone=yes" />
      <meta name="distribution" content="global" />
      <meta name="robots" content="noindex,nofollow" />
    </>
  )
}