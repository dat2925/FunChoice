import logo from './assets/solotech-logo.png'

export default function ProductBrand({ className = '' }: { className?: string }) {
  return <div className={'product-brand ' + className}>
    <img src={logo} alt="Logo SoloTech" />
    <small>Sản phẩm của SoloTech</small>
  </div>
}
