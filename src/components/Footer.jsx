import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="bg-gray-50 dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 mt-auto transition-colors duration-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-miami-red rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xs">R</span>
              </div>
              <span className="font-bold text-gray-900 dark:text-gray-100">Register<span className="text-miami-red">Buddy</span></span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              AI-powered course advisor built for Miami University students.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-3">Product</h4>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li><a href="#features" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Features</a></li>
              <li><a href="#pricing" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Pricing</a></li>
              <li><Link to="/onboarding" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Get started</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-3">Support</h4>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li><a href="#" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">FAQ</a></li>
              <li><a href="#" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Contact us</a></li>
              <li><a href="#" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Feedback</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-sm mb-3">Legal</h4>
            <ul className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
              <li><a href="#" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Privacy Policy</a></li>
              <li><a href="#" className="hover:text-gray-900 dark:hover:text-gray-100 transition-colors">Terms of Service</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            © 2026 RegisterBuddy. Not officially affiliated with Miami University.
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Made with ❤️ for Miami University students
          </p>
        </div>
      </div>
    </footer>
  )
}
