require 'rake'
require 'erb'

CONTAINER_NAME = 'unifi-controller'

def inside_version_directory(version)
  Dir.chdir(version)
  yield
  Dir.chdir('..')
end

def generate(version)
  template = ERB.new(File.read('Dockerfile.erb'))

  Dir.mkdir(version) unless Dir.exist?(version)
  inside_version_directory(version) do
    File.open('Dockerfile', 'w') do |f|
      f.write(template.result(binding))
    end
  end
end

desc "Generate new version"
task :generate, [:version] do |t, args|
  generate(args[:version])
end

def build(version)
  sh "docker build -t #{CONTAINER_NAME}:#{version} #{version}"
end

desc "Build docker container for specified version"
task :build, [:version] do |t, args|
  build(args[:version])
end

desc "Generate and build new container"
task :make, [:version] do |t, args|
  version = args[:version]
  [:generate, :build].each { |m| self.send(m, version) }
  puts "Test container and push to Docker Hub with\n$ docker push #{CONTAINER_NAME}:#{version}\n"
end
