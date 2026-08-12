declare module '*.jpg' {
  const image: import('next/image').StaticImageData;
  export default image;
}
