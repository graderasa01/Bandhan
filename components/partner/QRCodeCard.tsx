import Card from "@/components/ui/Card";

export default function QRCodeCard() {
  return (
    <Card title="QR Code">
      <div className="w-40 h-40 bg-stone-200 rounded-lg flex items-center justify-center mx-auto mb-3">
        <span className="text-stone-400 text-sm">QR Code</span>
      </div>
      <p className="text-xs text-stone-500 text-center mb-3">Real QR will be generated in production</p>
      <button className="w-full px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700">Download QR</button>
    </Card>
  );
}